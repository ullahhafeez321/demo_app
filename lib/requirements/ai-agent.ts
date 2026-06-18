import { openai } from "@ai-sdk/openai";
import { generateObject, generateText, streamText, tool } from "ai";
import { z } from "zod";

import { buildRagContext } from "@/lib/rag/context";
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
    const toolRun = await runRequirementAgentTools(request);
    const result = await generateObject({
      model: openai(process.env.OPENAI_MODEL ?? defaultModel),
      schema: requirementAgentResponseSchema,
      schemaName: "RequirementAgentResponse",
      schemaDescription:
        "A structured requirement engineering response for clients, developers, and agentic coding tools.",
      system: buildSystemPrompt(),
      prompt: buildStructuredPrompt(request, toolRun.contextText),
      temperature: 0.2,
    });

    return {
      ...requirementAgentResponseSchema.parse(result.object),
      provider: "openai",
      retrieval: toolRun.retrieval,
    };
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

function buildStructuredPrompt(request: RequirementAgentRequest, agentToolContext?: string) {
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
    agentToolContext ? "Agent tool results:" : undefined,
    agentToolContext,
    agentToolContext ? "" : undefined,
    "Required response rules:",
    "- Return all fields required by the schema. During early interview/questionnaire turns, requirements may be an empty array until enough client answers exist to produce accurate requirements.",
    "- Keep the same projectId if provided; otherwise create a concise projectId from the user request.",
    "- For questionnaire generation, questions must be specific to the client intent and previous answers. Each clarification question must include 3-4 answer options in its options field, and those options must directly answer that exact question. Mark exactly one option recommended. Always include an option that lets the client express a different/other direction. If the user says something broad like building a business/app/software, first ask what type of business/app it is, with options such as ecommerce, marketplace, healthcare, blood donation, booking, education, CRM, inventory, finance, logistics, and other. Do not ask generic implementation questions before the business domain is known. Never repeat a question topic, business fact, or decision already present in existingRequirements, message, or developerIntent. Return no more than 5 questions total.",
    "- If the request asks for the next interview question, return exactly one clarification question and keep artifacts limited to clarification_questions, questionnaire, change_summary, and agentic_json. Do not generate client_diagram or developer_srs artifacts during a next-question turn.",
    "- Include suggestions based on client intent and developer intent when available. Keep nextAction focused on completing the questionnaire, reviewing the generated software diagram, or reviewing the generated SRS.",
    "- Include artifacts that match the current phase only: interview turns should include clarification/questionnaire artifacts; diagram turns should include exactly one client_diagram artifact with valid Mermaid flowchart/graph code and no developer_srs; final SRS turns should include a developer_srs artifact and agentic_json.",
    "- If the message or developerIntent asks for software diagram generation, return zero clarification questions, keep requirements empty unless explicitly requested, and include a client_diagram artifact whose content starts with flowchart or graph and describes the requested software implementation process.",
    "- If the message or developerIntent says this is a final SRS generation request, return zero clarification questions unless a business-critical blocker remains, and make developer_srs the primary artifact with non-empty requirements. The developer_srs artifact content must be clean markdown prose in plain English sections, not JSON, not escaped JSON, not Mermaid, and not random placeholder text.",
    "- When documentText is provided, requirements must be concrete requirements extracted from that source context, not generic agent framework requirements.",
    "- For document_review, developer_srs must include source-backed functional requirements and acceptance criteria tied to uploaded content.",
    "- For change_request, change_summary must name affected workflows, screens, APIs, permissions, data models, and regression checks when the source context supports them.",
    "- The agentic JSON artifact content must be valid JSON as a string.",
  ].filter((line): line is string => typeof line === "string").join("\n");
}

async function runRequirementAgentTools(request: RequirementAgentRequest) {
  if (!request.projectId) {
    return { contextText: undefined, retrieval: undefined };
  }

  const retrievalResults: AgentToolRetrievalResult[] = [];
  const toolOutputs: AgentToolOutput[] = [];
  const result = await generateText({
    model: openai(process.env.OPENAI_MODEL ?? defaultModel),
    system: [
      buildSystemPrompt(),
      "You are operating as a tool-calling requirement agent. Use the available tools to inspect project context, interview memory, requirement readiness, and SRS evidence before producing the final structured response. Do not fabricate tool results.",
    ].join("\n"),
    prompt: [
      "Call the available tools needed for this requirement-engineering task. Prefer this sequence when relevant: retrieve_project_context, inspect_interview_memory, assess_requirement_readiness, validate_srs_evidence. Use each tool at most once, then summarize only evidence that should inform the final structured response pass.",
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
        },
        null,
        2,
      ),
    ].join("\n"),
    tools: {
      retrieve_project_context: tool({
        description: "Retrieve relevant uploaded document chunks and project context for a requirement-engineering request.",
        parameters: z.object({
          projectId: z.string().min(1),
          query: z.string().min(1),
          limit: z.number().int().min(1).max(6).default(4),
        }),
        execute: async ({ projectId, query, limit }) => {
          if (projectId !== request.projectId) {
            const output = {
              used: false,
              contextText: undefined,
              results: [],
            };
            retrievalResults.push(output);
            toolOutputs.push({
              toolName: "retrieve_project_context",
              summary: "Rejected retrieval for a different projectId.",
              data: { requestedProjectId: projectId, allowedProjectId: request.projectId },
            });
            return output;
          }

          const context = await buildRagContext(request.projectId, query);
          const limitedResults = context.results.slice(0, limit);
          const contextText = limitedResults.length
            ? limitedResults
                .map(
                  (item, index) =>
                    `[Tool Source ${index + 1}: ${item.fileName}, ${item.chunkId}, score ${item.score.toFixed(3)}]\n${item.text}`,
                )
                .join("\n\n")
            : undefined;
          const output = {
            used: Boolean(contextText),
            contextText,
            results: limitedResults,
          };
          retrievalResults.push(output);
          toolOutputs.push({
            toolName: "retrieve_project_context",
            summary: output.used
              ? `Retrieved ${limitedResults.length} project context chunk(s).`
              : "No uploaded project context matched the request.",
            data: output,
          });
          return output;
        },
      }),
      inspect_interview_memory: tool({
        description: "Inspect the current request and interview transcript to identify stored answers, answered topics, and unresolved context.",
        parameters: z.object({
          focus: z.string().min(1).max(160).default("current requirement interview"),
        }),
        execute: async ({ focus }) => {
          const memory = inspectInterviewMemory(request, focus);
          toolOutputs.push({
            toolName: "inspect_interview_memory",
            summary: `Found ${memory.answerCount} stored answer(s) and ${memory.answeredTopics.length} answered topic(s).`,
            data: memory,
          });
          return memory;
        },
      }),
      assess_requirement_readiness: tool({
        description: "Assess whether the collected context is ready for next question, diagram generation, or SRS generation.",
        parameters: z.object({
          targetPhase: z.enum(["next_question", "diagram", "srs"]),
        }),
        execute: async ({ targetPhase }) => {
          const readiness = assessRequirementReadiness(request, targetPhase);
          toolOutputs.push({
            toolName: "assess_requirement_readiness",
            summary: `${targetPhase} readiness score is ${readiness.score}/100 with ${readiness.missingAreas.length} missing area(s).`,
            data: readiness,
          });
          return readiness;
        },
      }),
      validate_srs_evidence: tool({
        description: "Validate whether available evidence is sufficient for a developer-ready SRS without inventing missing facts.",
        parameters: z.object({
          strictness: z.enum(["demo", "standard", "strict"]).default("standard"),
        }),
        execute: async ({ strictness }) => {
          const validation = validateSrsEvidence(request, strictness);
          toolOutputs.push({
            toolName: "validate_srs_evidence",
            summary: validation.ready
              ? "Available evidence is sufficient for a draft SRS."
              : `SRS evidence has ${validation.blockers.length} blocker(s).`,
            data: validation,
          });
          return validation;
        },
      }),
    },
    toolChoice: "required",
    maxSteps: 5,
    temperature: 0,
  });

  const retrieval = retrievalResults.find((item) => item.used) ?? retrievalResults[0];
  const contextParts = [
    result.text ? `Agent tool reasoning summary:
${result.text}` : undefined,
    toolOutputs.length ? `Executed agent tools:
${formatAgentToolOutputs(toolOutputs)}` : undefined,
    retrieval?.contextText ? `Retrieved project context from tool calls:
${retrieval.contextText}` : undefined,
  ].filter(Boolean);

  return {
    contextText: contextParts.length ? contextParts.join("\n\n") : undefined,
    retrieval: retrieval
      ? {
          used: retrieval.used,
          results: retrieval.results,
        }
      : undefined,
  };
}

type AgentToolRetrievalResult = {
  used: boolean;
  contextText?: string;
  results: NonNullable<RequirementAgentResponse["retrieval"]>["results"];
};

type AgentToolOutput = {
  toolName: string;
  summary: string;
  data: unknown;
};

function inspectInterviewMemory(request: RequirementAgentRequest, focus: string) {
  const combined = buildRequestEvidenceText(request);
  const answerMatches = [...combined.matchAll(/(?:Answer|Confirmed answer):\s*(.+)/gi)].map((match) => match[1].trim());
  const questionMatches = [...combined.matchAll(/(?:Question|Already answered question):\s*(.+)/gi)].map((match) => match[1].trim());
  const answeredTopics = extractRequirementAreas(combined);

  return {
    focus,
    answerCount: answerMatches.length,
    questionCount: questionMatches.length,
    answeredTopics,
    recentAnswers: answerMatches.slice(-5),
    transcriptExcerpt: combined.slice(0, 2400),
  };
}

function assessRequirementReadiness(request: RequirementAgentRequest, targetPhase: "next_question" | "diagram" | "srs") {
  const combined = buildRequestEvidenceText(request);
  const coveredAreas = extractRequirementAreas(combined);
  const requiredAreas = targetPhase === "next_question"
    ? ["business domain", "users"]
    : targetPhase === "diagram"
      ? ["business domain", "users", "workflow", "data", "outcome"]
      : ["business domain", "users", "workflow", "data", "permissions", "acceptance criteria"];
  const missingAreas = requiredAreas.filter((area) => !coveredAreas.includes(area));
  const score = Math.round(((requiredAreas.length - missingAreas.length) / requiredAreas.length) * 100);

  return {
    targetPhase,
    score,
    ready: missingAreas.length === 0,
    coveredAreas,
    missingAreas,
    recommendation: missingAreas.length
      ? `Ask or confirm: ${missingAreas.join(", ")}.`
      : `Proceed with ${targetPhase}.`,
  };
}

function validateSrsEvidence(request: RequirementAgentRequest, strictness: "demo" | "standard" | "strict") {
  const readiness = assessRequirementReadiness(request, "srs");
  const combined = buildRequestEvidenceText(request);
  const blockers = [...readiness.missingAreas];
  if (strictness !== "demo" && !/acceptance|success|criteria|done|complete/i.test(combined)) {
    blockers.push("measurable acceptance criteria");
  }
  if (strictness === "strict" && !/integration|notification|email|sms|api|external/i.test(combined)) {
    blockers.push("integration and notification constraints");
  }

  return {
    strictness,
    ready: blockers.length === 0,
    blockers: [...new Set(blockers)],
    evidenceSummary: combined.slice(0, 1800),
  };
}

function buildRequestEvidenceText(request: RequirementAgentRequest) {
  return [
    request.message,
    request.existingRequirements,
    request.developerIntent,
    request.documentText,
  ].filter(Boolean).join("\n\n");
}

function extractRequirementAreas(value: string) {
  const text = value.toLowerCase();
  const areas: string[] = [];
  if (/business|domain|app|platform|system|portal|dashboard|ecommerce|health|blood|booking|education|crm|inventory/.test(text)) areas.push("business domain");
  if (/user|role|admin|client|customer|donor|hospital|patient|student|manager|staff/.test(text)) areas.push("users");
  if (/workflow|process|step|submit|request|approve|match|search|book|register|track/.test(text)) areas.push("workflow");
  if (/data|field|record|profile|document|blood type|location|quantity|status|report/.test(text)) areas.push("data");
  if (/permission|access|role|verify|admin|auth|login/.test(text)) areas.push("permissions");
  if (/success|criteria|acceptance|complete|done|metric|mvp/.test(text)) areas.push("acceptance criteria");
  if (/goal|outcome|reduce|improve|business result/.test(text)) areas.push("outcome");
  return [...new Set(areas)];
}

function formatAgentToolOutputs(outputs: AgentToolOutput[]) {
  return outputs
    .map((output, index) => `Tool ${index + 1}: ${output.toolName}\nSummary: ${output.summary}\nData: ${JSON.stringify(output.data).slice(0, 2500)}`)
    .join("\n\n");
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
