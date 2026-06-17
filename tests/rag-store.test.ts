import { afterEach, describe, expect, it } from "vitest";

import { clearRagStore, persistDocument, searchDocuments } from "@/lib/rag/store";
import type { DocumentIntakeResult } from "@/lib/documents/types";

afterEach(async () => {
  await clearRagStore("vitest-project");
});

describe("RAG store facade", () => {
  it("persists chunks and retrieves relevant project context", async () => {
    const intake: DocumentIntakeResult = {
      documentId: "doc-vitest",
      fileName: "vitest.txt",
      mimeType: "text/plain",
      size: 120,
      textPreview: "The backend shall retrieve document chunks for SRS answers.",
      extractedTextLength: 58,
      chunks: [
        {
          id: "doc-vitest-chunk-001",
          index: 0,
          text: "The backend shall retrieve document chunks for SRS answers.",
          startOffset: 0,
          endOffset: 58,
        },
      ],
      findings: [],
    };

    const persisted = await persistDocument({ projectId: "vitest-project", intake });
    const results = await searchDocuments("vitest-project", "retrieve chunks for SRS", 3);

    expect(persisted.chunks).toHaveLength(1);
    expect(["local", "supabase"]).toContain(persisted.storeProvider);
    expect(results).toHaveLength(1);
    expect(results[0].chunkId).toBe("doc-vitest-chunk-001");
    expect(results[0].score).toBeGreaterThan(0);
  });
});
