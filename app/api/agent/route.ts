import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { createRequestLogger } from "@/lib/api/logger";
import { GuardrailViolationError, assertRequestSize, maxJsonRequestBytes } from "@/lib/api/guardrails";
import { guardrailErrorResponse, serverErrorResponse, serviceUnavailableResponse, validationErrorResponse } from "@/lib/api/responses";
import {
  createRequirementAgentResponseWithAi,
  createRequirementAgentStream,
} from "@/lib/requirements/ai-agent";
import { buildRagContext } from "@/lib/rag/context";
import { RequirementAgentConfigurationError, RequirementAgentProviderError } from "@/lib/requirements/errors";
import { requirementAgentRequestSchema } from "@/lib/requirements/schemas";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const logger = createRequestLogger("/api/agent");

  try {
    assertRequestSize(request, maxJsonRequestBytes);
    const body = await request.json();
    const payload = requirementAgentRequestSchema.parse(body);
    const ragContext = payload.projectId
      ? await buildRagContext(payload.projectId, payload.message)
      : undefined;
    const enrichedPayload = ragContext?.contextText
      ? {
          ...payload,
          documentText: [payload.documentText, ragContext.contextText].filter(Boolean).join("\n\nRetrieved project context:\n"),
        }
      : payload;

    if (enrichedPayload.stream) {
      logger.info("agent_stream_started", {
        projectId: enrichedPayload.projectId,
        retrievalUsed: Boolean(ragContext?.contextText),
        status: 200,
      });
      return createRequirementAgentStream(enrichedPayload);
    }

    const result = await createRequirementAgentResponseWithAi(enrichedPayload);

    logger.info("agent_response_completed", {
      projectId: enrichedPayload.projectId,
      provider: result.provider,
      retrievalUsed: Boolean(ragContext?.contextText),
      status: 200,
    });

    return NextResponse.json({
      ...result,
      retrieval: ragContext
        ? {
            used: Boolean(ragContext.contextText),
            results: ragContext.results,
          }
        : undefined,
    });
  } catch (error) {
    if (error instanceof ZodError) {
      logger.warn("invalid_agent_request", { status: 400 });
      return validationErrorResponse("Invalid requirement agent request.", error);
    }

    if (error instanceof GuardrailViolationError) {
      logger.warn("agent_guardrail_violation", { status: 400, reason: error.message, code: error.code });
      return guardrailErrorResponse(error.message, error.code);
    }

    if (
      error instanceof RequirementAgentConfigurationError ||
      error instanceof RequirementAgentProviderError
    ) {
      logger.warn("agent_provider_unavailable", {
        status: 503,
        reason: error.message,
      });
      return serviceUnavailableResponse(error.message);
    }

    logger.error("agent_request_failed", error, { status: 500 });
    return serverErrorResponse("Unable to process requirement agent request.");
  }
}
