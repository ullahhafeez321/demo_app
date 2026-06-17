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


## Supabase pgvector Setup

Run this SQL migration in Supabase before enabling Supabase-backed RAG:

```text
supabase/migrations/001_rag_pgvector.sql
```

Set these environment variables in `.env.local` or Vercel:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_DOCUMENTS_TABLE=documents
SUPABASE_CHUNKS_TABLE=document_chunks
SUPABASE_MATCH_FUNCTION=match_document_chunks
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

When these Supabase variables are present, document upload and retrieval use Supabase pgvector. If Supabase fails or is not configured, the backend falls back to the local `.rag-store/` development store.


## AI Provider Failures

`POST /api/agent` is client-facing and requires OpenAI. If `OPENAI_API_KEY` is missing or OpenAI fails, the API returns HTTP `503` with a clear error message instead of returning deterministic template output.

The deterministic agent remains available internally for tests and baseline prompt structure, but it is not used as a silent client-facing fallback.
