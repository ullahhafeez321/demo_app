import {
  clearRagStore as clearLocalRagStore,
  persistDocument as persistDocumentLocally,
  searchDocuments as searchLocalDocuments,
} from "@/lib/rag/local-store";
import {
  clearSupabaseRagStore,
  isSupabaseRagConfigured,
  persistDocumentToSupabase,
  searchDocumentsInSupabase,
} from "@/lib/rag/supabase-store";
import type { PersistDocumentInput } from "@/lib/rag/types";

export async function persistDocument(input: PersistDocumentInput) {
  if (isSupabaseRagConfigured()) {
    return persistDocumentToSupabase(input);
  }

  return { ...(await persistDocumentLocally(input)), storeProvider: "local" as const };
}

export async function searchDocuments(projectId: string, query: string, limit = 5) {
  if (isSupabaseRagConfigured()) {
    return searchDocumentsInSupabase(projectId, query, limit);
  }

  return searchLocalDocuments(projectId, query, limit);
}

export async function clearRagStore(projectId?: string) {
  if (isSupabaseRagConfigured()) {
    return clearSupabaseRagStore(projectId);
  }

  return { ...(await clearLocalRagStore(projectId)), storeProvider: "local" as const };
}

export function getRagStoreProvider() {
  return isSupabaseRagConfigured() ? "supabase" : "local";
}
