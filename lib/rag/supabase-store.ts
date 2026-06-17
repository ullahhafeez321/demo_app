import { createClient } from "@supabase/supabase-js";

import { embedQuery, embedTexts } from "@/lib/rag/embeddings";
import type { PersistDocumentInput, RagSearchResult, StoredDocument, StoredDocumentChunk } from "@/lib/rag/types";

const documentsTable = process.env.SUPABASE_DOCUMENTS_TABLE ?? "documents";
const chunksTable = process.env.SUPABASE_CHUNKS_TABLE ?? "document_chunks";
const matchFunction = process.env.SUPABASE_MATCH_FUNCTION ?? "match_document_chunks";

export function isSupabaseRagConfigured() {
  return Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export async function persistDocumentToSupabase(input: PersistDocumentInput) {
  const supabase = createSupabaseClient();
  const embeddings = await embedTexts(input.intake.chunks.map((chunk) => chunk.text));
  const createdAt = new Date().toISOString();

  const document: StoredDocument = {
    projectId: input.projectId,
    documentId: input.intake.documentId,
    fileName: input.intake.fileName,
    mimeType: input.intake.mimeType,
    size: input.intake.size,
    pageCount: input.intake.pageCount,
    extractedTextLength: input.intake.extractedTextLength,
    textPreview: input.intake.textPreview,
    createdAt,
  };

  const chunks: StoredDocumentChunk[] = input.intake.chunks.map((chunk, index) => ({
    ...chunk,
    projectId: input.projectId,
    documentId: input.intake.documentId,
    fileName: input.intake.fileName,
    embedding: embeddings[index].embedding,
    embeddingProvider: embeddings[index].provider,
    embeddingModel: embeddings[index].model,
  }));

  const { error: documentError } = await supabase.from(documentsTable).upsert(
    {
      project_id: document.projectId,
      document_id: document.documentId,
      file_name: document.fileName,
      mime_type: document.mimeType,
      size: document.size,
      page_count: document.pageCount ?? null,
      extracted_text_length: document.extractedTextLength,
      text_preview: document.textPreview,
      created_at: document.createdAt,
    },
    { onConflict: "document_id" },
  );

  if (documentError) {
    throw new Error(`Supabase document upsert failed: ${documentError.message}`);
  }

  const { error: deleteError } = await supabase
    .from(chunksTable)
    .delete()
    .eq("document_id", document.documentId);

  if (deleteError) {
    throw new Error(`Supabase chunk cleanup failed: ${deleteError.message}`);
  }

  const { error: chunksError } = await supabase.from(chunksTable).insert(
    chunks.map((chunk) => ({
      project_id: chunk.projectId,
      document_id: chunk.documentId,
      chunk_id: chunk.id,
      file_name: chunk.fileName,
      chunk_index: chunk.index,
      text: chunk.text,
      start_offset: chunk.startOffset,
      end_offset: chunk.endOffset,
      embedding: formatVector(chunk.embedding),
      embedding_provider: chunk.embeddingProvider,
      embedding_model: chunk.embeddingModel,
    })),
  );

  if (chunksError) {
    throw new Error(`Supabase chunk insert failed: ${chunksError.message}`);
  }

  return { document, chunks, storeProvider: "supabase" as const };
}

export async function searchDocumentsInSupabase(
  projectId: string,
  query: string,
  limit = 5,
): Promise<RagSearchResult[]> {
  const supabase = createSupabaseClient();
  const queryEmbedding = await embedQuery(query);

  const { data, error } = await supabase.rpc(matchFunction, {
    query_embedding: formatVector(queryEmbedding.embedding),
    match_project_id: projectId,
    match_count: limit,
  });

  if (error) {
    throw new Error(`Supabase retrieval failed: ${error.message}`);
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    documentId: String(row.document_id),
    chunkId: String(row.chunk_id),
    fileName: String(row.file_name),
    text: String(row.text),
    score: Number(row.similarity ?? 0),
    index: Number(row.chunk_index ?? 0),
  }));
}

export async function clearSupabaseRagStore(projectId?: string) {
  const supabase = createSupabaseClient();

  if (!projectId) {
    const { error: chunkError } = await supabase.from(chunksTable).delete().neq("chunk_id", "");
    if (chunkError) {
      throw new Error(`Supabase chunk reset failed: ${chunkError.message}`);
    }

    const { error: documentError } = await supabase.from(documentsTable).delete().neq("document_id", "");
    if (documentError) {
      throw new Error(`Supabase document reset failed: ${documentError.message}`);
    }

    return { clearedAll: true, projectId: undefined, storeProvider: "supabase" as const };
  }

  const { error: chunkError } = await supabase.from(chunksTable).delete().eq("project_id", projectId);
  if (chunkError) {
    throw new Error(`Supabase project chunk reset failed: ${chunkError.message}`);
  }

  const { error: documentError } = await supabase
    .from(documentsTable)
    .delete()
    .eq("project_id", projectId);
  if (documentError) {
    throw new Error(`Supabase project document reset failed: ${documentError.message}`);
  }

  return { clearedAll: false, projectId, storeProvider: "supabase" as const };
}

function createSupabaseClient() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Supabase RAG store is not configured.");
  }

  return createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function formatVector(vector: number[]) {
  return `[${vector.join(",")}]`;
}
