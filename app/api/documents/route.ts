import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { createRequestLogger } from "@/lib/api/logger";
import { GuardrailViolationError, assertRequestSize, maxMultipartRequestBytes, projectIdSchema } from "@/lib/api/guardrails";
import { badRequestResponse, validationErrorResponse } from "@/lib/api/responses";
import { processDocumentUpload } from "@/lib/documents/processor";
import { persistDocument } from "@/lib/rag/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const logger = createRequestLogger("/api/documents");

  try {
    assertRequestSize(request, maxMultipartRequestBytes);
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      logger.warn("missing_file", { status: 400 });
      return badRequestResponse("Upload a document using multipart/form-data with a file field named file.");
    }

    const projectIdValue = formData.get("projectId");
    const projectId = projectIdSchema.parse(typeof projectIdValue === "string" && projectIdValue.trim()
      ? projectIdValue.trim()
      : "default-project");
    const result = await processDocumentUpload(file);
    const persisted = await persistDocument({ projectId, intake: result });

    logger.info("document_uploaded", {
      projectId,
      documentId: result.documentId,
      chunkCount: persisted.chunks.length,
      embeddingProvider: persisted.chunks[0]?.embeddingProvider,
      storeProvider: persisted.storeProvider,
      status: 200,
    });

    return NextResponse.json({
      ...result,
      projectId,
      rag: {
        stored: true,
        chunkCount: persisted.chunks.length,
        embeddingProvider: persisted.chunks[0]?.embeddingProvider,
        embeddingModel: persisted.chunks[0]?.embeddingModel,
        storeProvider: persisted.storeProvider,
      },
    });
  } catch (error) {
    if (error instanceof ZodError) {
      logger.warn("invalid_document_upload_request", { status: 400 });
      return validationErrorResponse("Invalid document upload request.", error);
    }

    const message = error instanceof Error ? error.message : "Unable to process uploaded document.";
    logger.error("document_upload_failed", error, { status: 400 });
    return badRequestResponse(
      message,
      error instanceof GuardrailViolationError ? error.code : "document_upload_failed",
    );
  }
}
