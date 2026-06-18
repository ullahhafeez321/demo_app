import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { createRequestLogger } from "@/lib/api/logger";
import { assertRequestSize, maxJsonRequestBytes, projectIdSchema } from "@/lib/api/guardrails";
import { serverErrorResponse, validationErrorResponse } from "@/lib/api/responses";
import { clearRagStore } from "@/lib/rag/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const logger = createRequestLogger("/api/demo/reset");

  try {
    assertRequestSize(request, maxJsonRequestBytes);
    const body = await request.json().catch(() => ({}));
    const projectId = typeof body.projectId === "string" && body.projectId.trim()
      ? projectIdSchema.parse(body.projectId.trim())
      : undefined;
    const result = await clearRagStore(projectId);

    logger.info("rag_store_reset", { projectId, status: 200 });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ZodError) {
      logger.warn("invalid_demo_reset_request", { status: 400 });
      return validationErrorResponse("Invalid demo reset request.", error);
    }

    logger.error("demo_reset_failed", error, { status: 500 });
    return serverErrorResponse("Unable to reset demo state.");
  }
}
