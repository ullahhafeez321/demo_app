import { PDFParse } from "pdf-parse";

import type { DocumentChunk, DocumentIntakeResult, DocumentRequirementFinding } from "@/lib/documents/types";

const maxUploadBytes = 8 * 1024 * 1024;
const chunkSize = 1400;
const chunkOverlap = 180;

export async function processDocumentUpload(file: File): Promise<DocumentIntakeResult> {
  validateFile(file);

  const buffer = Buffer.from(await file.arrayBuffer());
  const extraction = await extractText(file, buffer);
  const normalizedText = normalizeWhitespace(extraction.text);

  if (normalizedText.length < 20) {
    throw new Error("Document did not contain enough readable text for requirement analysis.");
  }

  const documentId = createDocumentId(file.name, normalizedText);
  const chunks = chunkDocumentText(documentId, normalizedText);
  const findings = extractRequirementFindings(chunks);

  return {
    documentId,
    fileName: file.name,
    mimeType: getSupportedMimeType(file),
    size: file.size,
    pageCount: extraction.pageCount,
    textPreview: normalizedText.slice(0, 1200),
    extractedTextLength: normalizedText.length,
    chunks,
    findings,
  };
}

function validateFile(file: File) {
  if (file.size <= 0) {
    throw new Error("Uploaded document is empty.");
  }

  if (file.size > maxUploadBytes) {
    throw new Error("Uploaded document exceeds the 8 MB demo limit.");
  }

  const mimeType = getSupportedMimeType(file);
  const supported = ["application/pdf", "text/plain", "text/markdown"].includes(mimeType);

  if (!supported) {
    throw new Error("Only PDF, plain text, and markdown documents are supported in Phase 3.");
  }
}

async function extractText(file: File, buffer: Buffer) {
  const mimeType = getSupportedMimeType(file);

  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });

    try {
      const result = await parser.getText();

      return {
        text: result.text,
        pageCount: result.pages.length,
      };
    } finally {
      await parser.destroy();
    }
  }

  return {
    text: buffer.toString("utf8"),
    pageCount: undefined,
  };
}

function chunkDocumentText(documentId: string, text: string): DocumentChunk[] {
  const chunks: DocumentChunk[] = [];
  let startOffset = 0;
  let index = 0;

  while (startOffset < text.length) {
    const targetEnd = Math.min(startOffset + chunkSize, text.length);
    const endOffset = findChunkEnd(text, startOffset, targetEnd);
    const chunkText = text.slice(startOffset, endOffset).trim();

    if (chunkText) {
      chunks.push({
        id: `${documentId}-chunk-${String(index + 1).padStart(3, "0")}`,
        index,
        text: chunkText,
        startOffset,
        endOffset,
      });
      index += 1;
    }

    if (endOffset >= text.length) {
      break;
    }

    startOffset = Math.max(endOffset - chunkOverlap, startOffset + 1);
  }

  return chunks;
}

function findChunkEnd(text: string, startOffset: number, targetEnd: number) {
  if (targetEnd >= text.length) {
    return text.length;
  }

  const sentenceBreak = text.lastIndexOf(". ", targetEnd);
  if (sentenceBreak > startOffset + chunkSize * 0.6) {
    return sentenceBreak + 1;
  }

  const paragraphBreak = text.lastIndexOf("\n", targetEnd);
  if (paragraphBreak > startOffset + chunkSize * 0.6) {
    return paragraphBreak;
  }

  const wordBreak = text.lastIndexOf(" ", targetEnd);
  return wordBreak > startOffset ? wordBreak : targetEnd;
}

function extractRequirementFindings(chunks: DocumentChunk[]): DocumentRequirementFinding[] {
  const findings: DocumentRequirementFinding[] = [];
  const requirementSignals = [
    "shall",
    "must",
    "should",
    "required",
    "requirement",
    "user can",
    "user should",
    "system",
    "feature",
    "acceptance",
  ];

  for (const chunk of chunks) {
    const sentences = chunk.text.split(/(?<=[.!?])\s+/).filter(Boolean);

    for (const sentence of sentences) {
      const lower = sentence.toLowerCase();
      const matchedSignal = requirementSignals.find((signal) => lower.includes(signal));

      if (!matchedSignal) {
        continue;
      }

      findings.push({
        id: `finding-${String(findings.length + 1).padStart(3, "0")}`,
        chunkId: chunk.id,
        title: createFindingTitle(sentence),
        evidence: sentence.trim().slice(0, 500),
        confidence: ["shall", "must", "required", "acceptance"].includes(matchedSignal)
          ? "high"
          : "medium",
      });

      if (findings.length >= 20) {
        return findings;
      }
    }
  }

  return findings;
}

function createFindingTitle(sentence: string) {
  return sentence
    .replace(/^[^a-zA-Z0-9]+/, "")
    .trim()
    .slice(0, 90)
    .replace(/[.:;,-]+$/, "");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\r/g, "\n").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function createDocumentId(fileName: string, text: string) {
  const slug = fileName
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 28);
  const hash = hashText(`${fileName}:${text.slice(0, 500)}`).toString(36);

  return `doc-${slug || "upload"}-${hash}`;
}

function hashText(value: string) {
  let hash = 5381;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 33) ^ value.charCodeAt(index);
  }

  return hash >>> 0;
}

function getSupportedMimeType(file: File) {
  const inferred = inferMimeType(file.name);

  if (!file.type || file.type === "application/octet-stream") {
    return inferred;
  }

  return file.type;
}

function inferMimeType(fileName: string) {
  const lower = fileName.toLowerCase();

  if (lower.endsWith(".pdf")) {
    return "application/pdf";
  }

  if (lower.endsWith(".md")) {
    return "text/markdown";
  }

  return "text/plain";
}
