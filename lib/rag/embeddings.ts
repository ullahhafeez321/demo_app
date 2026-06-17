import { openai } from "@ai-sdk/openai";
import { embed, embedMany } from "ai";

import type { EmbeddingProvider } from "@/lib/rag/types";

const localDimensions = 256;
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

  if (process.env.OPENAI_API_KEY) {
    try {
      const model = process.env.OPENAI_EMBEDDING_MODEL ?? defaultEmbeddingModel;
      const result = await embedMany({
        model: openai.embedding(model),
        values,
      });

      return result.embeddings.map((embedding) => ({
        embedding,
        provider: "openai",
        model,
      }));
    } catch (error) {
      console.error("OpenAI embeddings failed. Falling back to local hash embeddings.", error);
    }
  }

  return values.map((value) => ({
    embedding: createLocalEmbedding(value),
    provider: "local_hash",
    model: `local-hash-${localDimensions}`,
  }));
}

export async function embedQuery(value: string): Promise<EmbeddingResult> {
  if (process.env.OPENAI_API_KEY) {
    try {
      const model = process.env.OPENAI_EMBEDDING_MODEL ?? defaultEmbeddingModel;
      const result = await embed({
        model: openai.embedding(model),
        value,
      });

      return {
        embedding: result.embedding,
        provider: "openai",
        model,
      };
    } catch (error) {
      console.error("OpenAI query embedding failed. Falling back to local hash embedding.", error);
    }
  }

  return {
    embedding: createLocalEmbedding(value),
    provider: "local_hash",
    model: `local-hash-${localDimensions}`,
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

export function lexicalSimilarity(query: string, text: string) {
  const queryTerms = new Set(tokenize(query));
  const textTerms = new Set(tokenize(text));

  if (queryTerms.size === 0 || textTerms.size === 0) {
    return 0;
  }

  let overlap = 0;
  for (const term of queryTerms) {
    if (textTerms.has(term)) {
      overlap += 1;
    }
  }

  return overlap / Math.sqrt(queryTerms.size * textTerms.size);
}

function createLocalEmbedding(value: string) {
  const vector = Array.from({ length: localDimensions }, () => 0);
  const terms = tokenize(value);

  for (const term of terms) {
    const index = hashText(term) % localDimensions;
    vector[index] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, item) => sum + item * item, 0));
  return magnitude === 0 ? vector : vector.map((item) => item / magnitude);
}

function tokenize(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter((term) => term.length > 2);
}

function hashText(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}
