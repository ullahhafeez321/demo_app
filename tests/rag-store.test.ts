import { afterEach, describe, expect, it } from "vitest";

import { clearRagStore } from "@/lib/rag/store";
import { embedTexts } from "@/lib/rag/embeddings";

const originalOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(async () => {
  process.env.OPENAI_API_KEY = originalOpenAiKey;
  await clearRagStore("vitest-project");
});

describe("RAG embedding policy", () => {
  it("requires OpenAI embeddings instead of local deterministic embeddings", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(embedTexts(["The backend shall retrieve document chunks for SRS answers."])).rejects.toThrow(
      "OpenAI API key is required for document embeddings.",
    );
  });
});
