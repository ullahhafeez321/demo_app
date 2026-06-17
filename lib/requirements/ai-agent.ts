import { openai } from "@ai-sdk/openai";
import { generateObject, streamText } from "ai";

import { createRequirementAgentResponse } from "@/lib/requirements/agent";
import { requirementAgentResponseSchema } from "@/lib/requirements/schemas";
import { RequirementAgentConfigurationError, RequirementAgentProviderError } from "@/lib/requirements/errors";
import type { RequirementAgentRequest, RequirementAgentResponse } from "@/lib/requirements/types";

const defaultModel = "gpt-4o-mini";

export async function createRequirementAgentResponseWithAi(
  request: RequirementAgentRequest,
): Promise<RequirementAgentResponse> {
  const baseline = createRequirementAgentResponse(request);

  if (!hasOpenAiKey()) {
    throw new RequirementAgentConfigurationError(
      "OpenAI API key is missing. Configure OPENAI_API_KEY before using the requirement agent.",
    );
  }

  try {
    const result = await generateObject({
      model: openai(process.env.OPENAI_MODEL ?? defaultModel),
      schema: requirementAgentResponseSchema,
      schemaName: "RequirementAgentResponse",
      schemaDescription:
        "A structured requirement engineering response for clients, developers, and agentic coding tools.",
      system: buildSystemPrompt(),
      prompt: buildStructuredPrompt(request, baseline),
      temperature: 0.2,
    });

    return { ...requirementAgentResponseSchema.parse(result.object), provider: "openai" };
  } catch (error) {
    console.error("AI requirement agent failed.", error);
    throw new RequirementAgentProviderError(
      "The AI requirement agent could not generate a response. Please retry shortly or verify the OpenAI configuration.",
    );
  }
}

export function createRequirementAgentStream(request: RequirementAgentRequest): Response {
  const baseline = createRequirementAgentResponse(request);

  if (!hasOpenAiKey()) {
    throw new RequirementAgentConfigurationError(
      "OpenAI API key is missing. Configure OPENAI_API_KEY before using streaming responses.",
    );
  }

  try {
    const result = streamText({
      model: openai(process.env.OPENAI_MODEL ?? defaultModel),
      system: buildSystemPrompt(),
      prompt: buildStreamingPrompt(request, baseline),
      temperature: 0.3,
    });

    return result.toTextStreamResponse({
      headers: {
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("AI requirement stream failed.", error);
    throw new RequirementAgentProviderError(
      "The AI requirement stream could not be started. Please retry shortly or verify the OpenAI configuration.",
    );
  }
}

function hasOpenAiKey() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function buildSystemPrompt() {
  return [
    "You are a senior backend engineer and AI requirement engineering agent.",
    "Your job is to clarify vague client requirements, detect gaps, recommend suggestions from client intent and developer intent, and produce developer-ready outputs.",
    "Always keep outputs practical, implementation-aware, and traceable to the user's request.",
    "When retrieved source context or documentText is provided, extract concrete requirements from that source instead of returning generic framework capabilities.",
    "Prefer domain-specific requirements, affected workflows, APIs, permissions, data models, screens, and acceptance criteria from the source context.",
    "Do not invent business-critical facts. Use assumptions and clarification questions when details are missing.",
    "For Mermaid artifacts, return only valid Mermaid code in the artifact content.",
  ].join("\n");
}

function buildStructuredPrompt(
  request: RequirementAgentRequest,
  fallback: RequirementAgentResponse,
) {
  return [
    "Create a structured requirement engineering response.",
    "",
    "Request:",
    JSON.stringify(
      {
        projectId: request.projectId,
        role: request.role,
        scenario: request.scenario,
        message: request.message,
        existingRequirements: request.existingRequirements,
        developerIntent: request.developerIntent,
        documentId: request.documentId,
        documentText: request.documentText?.slice(0, 6000),
      },
      null,
      2,
    ),
    "",
    "Required response rules:",
    "- Return all fields required by the schema.",
    "- Keep the same projectId if provided; otherwise use the fallback projectId.",
    "- Include at least one client-facing clarification question when user intent is vague.",
    "- Include suggestions based on client intent and developer intent when available.",
    "- Include artifacts for clarification questions, questionnaire, client diagram, developer SRS, change summary, and agentic JSON.",
    "- When documentText is provided, requirements must be concrete requirements extracted from that source context, not generic agent framework requirements.",
    "- For document_review, developer_srs must include source-backed functional requirements and acceptance criteria tied to uploaded content.",
    "- For change_request, change_summary must name affected workflows, screens, APIs, permissions, data models, and regression checks when the source context supports them.",
    "- The agentic JSON artifact content must be valid JSON as a string.",
    "",
    "Fallback structure is only a safety example. Do not copy generic fallback requirements when source context contains more specific product requirements:",
    JSON.stringify(fallback, null, 2),
  ].join("\n");
}

function buildStreamingPrompt(
  request: RequirementAgentRequest,
  fallback: RequirementAgentResponse,
) {
  return [
    "Stream a concise requirement engineering analysis for this request.",
    "Use these sections: Summary, Clarification Questions, Intent-Based Suggestions, Developer Notes, Next Action.",
    "Do not return raw JSON in this streaming response.",
    "",
    "Request:",
    JSON.stringify(
      {
        role: request.role,
        scenario: request.scenario,
        message: request.message,
        existingRequirements: request.existingRequirements,
        developerIntent: request.developerIntent,
        documentId: request.documentId,
        documentText: request.documentText?.slice(0, 4000),
      },
      null,
      2,
    ),
    "",
    "Deterministic baseline:",
    JSON.stringify(
      {
        summary: fallback.summary,
        questions: fallback.questions,
        suggestions: fallback.suggestions,
        nextAction: fallback.nextAction,
      },
      null,
      2,
    ),
  ].join("\n");
}
