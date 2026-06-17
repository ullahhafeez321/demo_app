export interface DocumentChunk {
  id: string;
  index: number;
  text: string;
  startOffset: number;
  endOffset: number;
}

export interface DocumentRequirementFinding {
  id: string;
  chunkId: string;
  title: string;
  evidence: string;
  confidence: "high" | "medium" | "low";
}

export interface DocumentIntakeResult {
  documentId: string;
  fileName: string;
  mimeType: string;
  size: number;
  pageCount?: number;
  textPreview: string;
  extractedTextLength: number;
  chunks: DocumentChunk[];
  findings: DocumentRequirementFinding[];
}
