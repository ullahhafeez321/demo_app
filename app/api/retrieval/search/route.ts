import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { createRequestLogger } from "@/lib/api/logger";
import { serverErrorResponse, validationErrorResponse } from "@/lib/api/responses";
import { getRagStoreProvider, searchDocuments } from "@/lib/rag/store";
import { ragSearchRequestSchema } from "@/lib/rag/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const logger = createRequestLogger("/api/retrieval/search");

  try {
    const payload = ragSearchRequestSchema.parse(await request.json());
    const results = await searchDocuments(payload.projectId, payload.query, payload.limit);

    logger.info("retrieval_search_completed", {
      projectId: payload.projectId,
      resultCount: results.length,
      status: 200,
    });

    return NextResponse.json({
      projectId: payload.projectId,
      query: payload.query,
      results,
      storeProvider: getRagStoreProvider(),
    });
  } catch (error) {
    if (error instanceof ZodError) {
      logger.warn("invalid_retrieval_search_request", { status: 400 });
      return validationErrorResponse("Invalid retrieval search request.", error);
    }

    logger.error("retrieval_search_failed", error, { status: 500 });
    return serverErrorResponse("Unable to search retrieval memory.");
  }
}
