import type { DocumentChunk, DocumentIntakeResult } from "@/lib/documents/types";

export type EmbeddingProvider = "openai";

export interface StoredDocument {
  projectId: string;
  documentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  pageCount?: number;
  extractedTextLength: number;
  textPreview: string;
  createdAt: string;
}

export interface StoredDocumentChunk extends DocumentChunk {
  projectId: string;
  documentId: string;
  fileName: string;
  embedding: number[];
  embeddingProvider: EmbeddingProvider;
  embeddingModel: string;
}

export interface RagSearchResult {
  documentId: string;
  chunkId: string;
  fileName: string;
  text: string;
  score: number;
  index: number;
}

export interface RagStorePayload {
  document: StoredDocument;
  chunks: StoredDocumentChunk[];
}

export interface PersistDocumentInput {
  projectId: string;
  intake: DocumentIntakeResult;
}
