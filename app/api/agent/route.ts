import { NextRequest, NextResponse } from "next/server";
import { ZodError } from "zod";

import { createRequestLogger } from "@/lib/api/logger";
import { GuardrailViolationError, assertRequestSize, maxJsonRequestBytes } from "@/lib/api/guardrails";
import { guardrailErrorResponse, serverErrorResponse, serviceUnavailableResponse, validationErrorResponse } from "@/lib/api/responses";
import {
  createRequirementAgentResponseWithAi,
  createRequirementAgentStream,
} from "@/lib/requirements/ai-agent";
import { RequirementAgentConfigurationError, RequirementAgentProviderError } from "@/lib/requirements/errors";
import { requirementAgentRequestSchema } from "@/lib/requirements/schemas";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: NextRequest) {
  const logger = createRequestLogger("/api/agent");

  try {
    assertRequestSize(request, maxJsonRequestBytes);
    const body = await request.json();
    const payload = requirementAgentRequestSchema.parse(body);

    if (payload.stream) {
      logger.info("agent_stream_started", {
        projectId: payload.projectId,
        retrievalUsed: false,
        status: 200,
      });
      return createRequirementAgentStream(payload);
    }

    const result = await createRequirementAgentResponseWithAi(payload);

    logger.info("agent_response_completed", {
      projectId: payload.projectId,
      provider: result.provider,
      retrievalUsed: Boolean(result.retrieval?.used),
      status: 200,
    });

    return NextResponse.json(result);
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
