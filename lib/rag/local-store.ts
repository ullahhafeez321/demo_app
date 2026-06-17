import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { cosineSimilarity, embedQuery, embedTexts, lexicalSimilarity } from "@/lib/rag/embeddings";
import type { PersistDocumentInput, RagSearchResult, RagStorePayload } from "@/lib/rag/types";

const storeDir = path.join(process.cwd(), ".rag-store");
const storePath = path.join(storeDir, "documents.json");

interface StoreFile {
  documents: RagStorePayload["document"][];
  chunks: RagStorePayload["chunks"];
}

export async function persistDocument(input: PersistDocumentInput) {
  const store = await readStore();
  const embeddings = await embedTexts(input.intake.chunks.map((chunk) => chunk.text));
  const createdAt = new Date().toISOString();

  const document = {
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

  const chunks = input.intake.chunks.map((chunk, index) => ({
    ...chunk,
    projectId: input.projectId,
    documentId: input.intake.documentId,
    fileName: input.intake.fileName,
    embedding: embeddings[index].embedding,
    embeddingProvider: embeddings[index].provider,
    embeddingModel: embeddings[index].model,
  }));

  const nextStore: StoreFile = {
    documents: [
      ...store.documents.filter((item) => item.documentId !== input.intake.documentId),
      document,
    ],
    chunks: [
      ...store.chunks.filter((item) => item.documentId !== input.intake.documentId),
      ...chunks,
    ],
  };

  await writeStore(nextStore);

  return { document, chunks };
}

export async function searchDocuments(projectId: string, query: string, limit = 5): Promise<RagSearchResult[]> {
  const store = await readStore();
  const queryEmbedding = await embedQuery(query);

  return store.chunks
    .filter((chunk) => chunk.projectId === projectId)
    .map((chunk) => {
      const vectorScore = cosineSimilarity(queryEmbedding.embedding, chunk.embedding);
      const lexicalScore = lexicalSimilarity(query, chunk.text);
      const sameProviderBonus = queryEmbedding.provider === chunk.embeddingProvider ? 0.05 : 0;

      return {
        documentId: chunk.documentId,
        chunkId: chunk.id,
        fileName: chunk.fileName,
        text: chunk.text,
        score: Math.max(vectorScore, lexicalScore) + sameProviderBonus,
        index: chunk.index,
      };
    })
    .sort((left, right) => right.score - left.score)
    .slice(0, limit);
}

export async function readProjectDocuments(projectId: string) {
  const store = await readStore();
  return store.documents.filter((document) => document.projectId === projectId);
}

export async function clearRagStore(projectId?: string) {
  if (!projectId) {
    await writeStore({ documents: [], chunks: [] });
    return { clearedAll: true, projectId: undefined };
  }

  const store = await readStore();
  await writeStore({
    documents: store.documents.filter((document) => document.projectId !== projectId),
    chunks: store.chunks.filter((chunk) => chunk.projectId !== projectId),
  });

  return { clearedAll: false, projectId };
}

async function readStore(): Promise<StoreFile> {
  try {
    const raw = await readFile(storePath, "utf8");
    return JSON.parse(raw) as StoreFile;
  } catch {
    return { documents: [], chunks: [] };
  }
}

async function writeStore(store: StoreFile) {
  await mkdir(storeDir, { recursive: true });
  await writeFile(storePath, JSON.stringify(store, null, 2));
}
