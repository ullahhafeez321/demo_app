import { NextRequest, NextResponse } from "next/server";

import { createRequestLogger } from "@/lib/api/logger";
import { clearRagStore } from "@/lib/rag/store";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const logger = createRequestLogger("/api/demo/reset");
  const body = await request.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" && body.projectId.trim()
    ? body.projectId.trim()
    : undefined;
  const result = await clearRagStore(projectId);

  logger.info("rag_store_reset", { projectId, status: 200 });

  return NextResponse.json({ ok: true, ...result });
}
