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
    try {
      return await persistDocumentToSupabase(input);
    } catch (error) {
      console.error("Supabase RAG persist failed. Falling back to local store.", error);
    }
  }

  return { ...(await persistDocumentLocally(input)), storeProvider: "local" as const };
}

export async function searchDocuments(projectId: string, query: string, limit = 5) {
  if (isSupabaseRagConfigured()) {
    try {
      return await searchDocumentsInSupabase(projectId, query, limit);
    } catch (error) {
      console.error("Supabase RAG search failed. Falling back to local store.", error);
    }
  }

  return searchLocalDocuments(projectId, query, limit);
}

export async function clearRagStore(projectId?: string) {
  if (isSupabaseRagConfigured()) {
    try {
      return await clearSupabaseRagStore(projectId);
    } catch (error) {
      console.error("Supabase RAG reset failed. Falling back to local store reset.", error);
    }
  }

  return { ...(await clearLocalRagStore(projectId)), storeProvider: "local" as const };
}

export function getRagStoreProvider() {
  return isSupabaseRagConfigured() ? "supabase" : "local";
}
