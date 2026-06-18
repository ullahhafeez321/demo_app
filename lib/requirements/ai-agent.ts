import { openai } from "@ai-sdk/openai";
import { generateObject, streamText } from "ai";

import { requirementAgentResponseSchema } from "@/lib/requirements/schemas";
import { RequirementAgentConfigurationError, RequirementAgentProviderError } from "@/lib/requirements/errors";
import type { RequirementAgentRequest, RequirementAgentResponse } from "@/lib/requirements/types";

const defaultModel = "gpt-4o-mini";

export async function createRequirementAgentResponseWithAi(
  request: RequirementAgentRequest,
): Promise<RequirementAgentResponse> {
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
      prompt: buildStructuredPrompt(request),
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
  if (!hasOpenAiKey()) {
    throw new RequirementAgentConfigurationError(
      "OpenAI API key is missing. Configure OPENAI_API_KEY before using streaming responses.",
    );
  }

  try {
    const result = streamText({
      model: openai(process.env.OPENAI_MODEL ?? defaultModel),
      system: buildSystemPrompt(),
      prompt: buildStreamingPrompt(request),
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
    "Your job is to run a human-in-the-loop requirement discovery session: clarify vague client requirements, detect gaps, recommend suggestions from client intent and developer intent, and produce developer-ready outputs only after the client intent is understood.",
    "Always keep outputs practical, conversational, implementation-aware, and traceable to the user's request.",
    "When retrieved source context or documentText is provided, extract concrete requirements from that source instead of returning generic framework capabilities.",
    "Prefer domain-specific requirements, affected workflows, APIs, permissions, data models, screens, and acceptance criteria from the source context.",
    "Do not invent business-critical facts. Use assumptions and client-facing clarification questions when details are missing. Ask questions in plain language that a non-technical client can answer.",
    "For Mermaid artifacts, return only valid Mermaid code in the artifact content. Client diagrams must show the implementation process of the requested software/product, including users, modules/screens, data, review/operations, notifications/integrations when relevant, and business outcome. Do not diagram the SRS process or requirement-agent workflow.",
  ].join("\n");
}

function buildStructuredPrompt(request: RequirementAgentRequest) {
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
    "- Return all fields required by the schema. During early interview/questionnaire turns, requirements may be an empty array until enough client answers exist to produce accurate requirements.",
    "- Keep the same projectId if provided; otherwise create a concise projectId from the user request.",
    "- For questionnaire generation, questions must be specific to the client intent and previous answers. Each clarification question must include 3-4 answer options in its options field, and those options must directly answer that exact question. Mark exactly one option recommended. Always include an option that lets the client express a different/other direction. If the user says something broad like building a business/app/software, first ask what type of business/app it is, with options such as ecommerce, marketplace, healthcare, blood donation, booking, education, CRM, inventory, finance, logistics, and other. Do not ask generic implementation questions before the business domain is known. Never repeat a question topic, business fact, or decision already present in existingRequirements, message, or developerIntent. If the business domain/type is already answered, immediately move to the next missing requirement area. Return no more than 5 questions total.",
    "- Include suggestions based on client intent and developer intent when available. Keep nextAction focused on completing the questionnaire or reviewing the generated SRS.",
    "- Include artifacts for clarification questions, questionnaire, client diagram, developer SRS, change summary, and agentic JSON.",
    "- If the message or developerIntent says this is a final SRS generation request, return zero clarification questions unless a business-critical blocker remains, and make developer_srs the primary artifact with non-empty requirements. The developer_srs artifact content must be clean markdown prose in plain English sections, not JSON, not escaped JSON, not Mermaid, and not random placeholder text.",
    "- When documentText is provided, requirements must be concrete requirements extracted from that source context, not generic agent framework requirements.",
    "- For document_review, developer_srs must include source-backed functional requirements and acceptance criteria tied to uploaded content.",
    "- For change_request, change_summary must name affected workflows, screens, APIs, permissions, data models, and regression checks when the source context supports them.",
    "- The agentic JSON artifact content must be valid JSON as a string.",
  ].join("\n");
}

function buildStreamingPrompt(request: RequirementAgentRequest) {
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
  ].join("\n");
}
