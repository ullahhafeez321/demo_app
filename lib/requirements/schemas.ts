import { z } from "zod";

import { boundedTextSchema, projectIdSchema } from "@/lib/api/guardrails";

export const requirementUserRoleSchema = z.enum(["client", "developer", "agentic_tool"]);
export const requirementScenarioSchema = z.enum([
  "initial_discovery",
  "change_request",
  "document_review",
]);
export const requirementArtifactKindSchema = z.enum([
  "clarification_questions",
  "questionnaire",
  "client_diagram",
  "developer_srs",
  "change_summary",
  "agentic_json",
]);

export const requirementAgentRequestSchema = z.object({
  projectId: projectIdSchema.optional(),
  role: requirementUserRoleSchema,
  scenario: requirementScenarioSchema,
  message: boundedTextSchema("Requirement message", 10, 8000),
  existingRequirements: boundedTextSchema("Existing requirements", 1, 20000).optional(),
  developerIntent: boundedTextSchema("Developer intent", 1, 4000).optional(),
  documentText: boundedTextSchema("Document text", 1, 30000).optional(),
  documentId: z.string().trim().min(1).max(120).optional(),
  stream: z.boolean().optional(),
});

export const clarificationAnswerOptionSchema = z.object({
  label: z.string().min(1),
  value: z.string().min(1),
  recommended: z.boolean().optional(),
});

export const clarificationQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  reason: z.string().min(1),
  target: requirementUserRoleSchema,
  options: z.array(clarificationAnswerOptionSchema).min(3).max(5),
});

export const requirementSuggestionSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  rationale: z.string().min(1),
  basedOn: z.enum(["client_intent", "developer_intent", "requirement_gap"]),
  priority: z.enum(["high", "medium", "low"]),
});

export const requirementItemSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  acceptanceCriteria: z.array(z.string().min(1)).min(1),
  priority: z.enum(["must_have", "should_have", "could_have"]),
});

export const requirementArtifactSchema = z.object({
  kind: requirementArtifactKindSchema,
  title: z.string().min(1),
  content: z.string().min(1),
  format: z.enum(["markdown", "mermaid", "json"]),
});

export const requirementAgentResponseSchema = z.object({
  projectId: z.string().min(1),
  scenario: requirementScenarioSchema,
  summary: z.string().min(1),
  questions: z.array(clarificationQuestionSchema),
  suggestions: z.array(requirementSuggestionSchema),
  requirements: z.array(requirementItemSchema),
  artifacts: z.array(requirementArtifactSchema).min(1),
  nextAction: z.string().min(1),
  provider: z.enum(["openai"]).optional(),
  retrieval: z.object({
    used: z.boolean(),
    results: z.array(z.object({
      documentId: z.string(),
      chunkId: z.string(),
      fileName: z.string(),
      text: z.string(),
      score: z.number(),
      index: z.number(),
    })),
  }).optional(),
});
