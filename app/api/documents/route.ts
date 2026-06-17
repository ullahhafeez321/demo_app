import { NextRequest, NextResponse } from "next/server";

import { createRequestLogger } from "@/lib/api/logger";
import { badRequestResponse } from "@/lib/api/responses";
import { processDocumentUpload } from "@/lib/documents/processor";
import { persistDocument } from "@/lib/rag/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const logger = createRequestLogger("/api/documents");

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      logger.warn("missing_file", { status: 400 });
      return badRequestResponse("Upload a document using multipart/form-data with a file field named file.");
    }

    const projectIdValue = formData.get("projectId");
    const projectId = typeof projectIdValue === "string" && projectIdValue.trim()
      ? projectIdValue.trim()
      : "default-project";
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
    logger.error("document_upload_failed", error, { status: 400 });
    return badRequestResponse(
      error instanceof Error ? error.message : "Unable to process uploaded document.",
    );
  }
}
