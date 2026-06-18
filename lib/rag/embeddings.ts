import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";

import type { EmbeddingProvider } from "@/lib/rag/types";

const defaultEmbeddingModel = "text-embedding-3-small";

export interface EmbeddingResult {
  embedding: number[];
  provider: EmbeddingProvider;
  model: string;
}

export async function embedTexts(values: string[]): Promise<EmbeddingResult[]> {
  if (values.length === 0) {
    return [];
  }

  const model = getEmbeddingModel();
  const result = await embedMany({
    model: openai.embedding(model),
    values,
  });

  return result.embeddings.map((embedding) => ({
    embedding,
    provider: "openai",
    model,
  }));
}

export async function embedQuery(value: string): Promise<EmbeddingResult> {
  const model = getEmbeddingModel();
  const result = await embed({
    model: openai.embedding(model),
    value,
  });

  return {
    embedding: result.embedding,
    provider: "openai",
    model,
  };
}

export function cosineSimilarity(left: number[], right: number[]) {
  if (left.length !== right.length || left.length === 0) {
    return 0;
  }

  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < left.length; index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  if (leftMagnitude === 0 || rightMagnitude === 0) {
    return 0;
  }

  return dot / (Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude));
}

function getEmbeddingModel() {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OpenAI API key is required for document embeddings.");
  }

  return process.env.OPENAI_EMBEDDING_MODEL ?? defaultEmbeddingModel;
}
