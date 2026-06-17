import { searchDocuments } from "@/lib/rag/store";

export async function buildRagContext(projectId: string, query: string) {
  const results = await searchDocuments(projectId, query, 4);

  if (results.length === 0) {
    return { results, contextText: undefined };
  }

  const contextText = results
    .map(
      (result, index) =>
        `[Source ${index + 1}: ${result.fileName}, ${result.chunkId}, score ${result.score.toFixed(3)}]\n${result.text}`,
    )
    .join("\n\n");

  return { results, contextText };
}
