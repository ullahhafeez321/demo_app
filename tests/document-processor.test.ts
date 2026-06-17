import { describe, expect, it } from "vitest";

import { processDocumentUpload } from "@/lib/documents/processor";

describe("document processor", () => {
  it("extracts text files into chunks and source-linked findings", async () => {
    const file = new File(
      [
        "The system must allow PDF uploads. ",
        "The backend shall extract text and create searchable chunks. ",
        "Acceptance criteria must include source-linked findings.",
      ],
      "requirements.txt",
      { type: "text/plain" },
    );

    const result = await processDocumentUpload(file);

    expect(result.documentId).toMatch(/^doc-requirements-/);
    expect(result.chunks).toHaveLength(1);
    expect(result.findings.length).toBeGreaterThanOrEqual(3);
    expect(result.findings[0].chunkId).toBe(result.chunks[0].id);
  });

  it("rejects unsupported document types", async () => {
    const file = new File(["hello"], "image.png", { type: "image/png" });

    await expect(processDocumentUpload(file)).rejects.toThrow(/Only PDF, plain text, and markdown/);
  });
});
