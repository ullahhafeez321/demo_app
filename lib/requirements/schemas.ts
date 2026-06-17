import { z } from "zod";

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
  projectId: z.string().min(1).optional(),
  role: requirementUserRoleSchema,
  scenario: requirementScenarioSchema,
  message: z.string().min(10, "Requirement message must contain at least 10 characters."),
  existingRequirements: z.string().optional(),
  developerIntent: z.string().optional(),
  documentText: z.string().optional(),
  documentId: z.string().optional(),
  stream: z.boolean().optional(),
});

export const clarificationQuestionSchema = z.object({
  id: z.string().min(1),
  question: z.string().min(1),
  reason: z.string().min(1),
  target: requirementUserRoleSchema,
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
  requirements: z.array(requirementItemSchema).min(1),
  artifacts: z.array(requirementArtifactSchema).min(1),
  nextAction: z.string().min(1),
  provider: z.enum(["openai", "deterministic_fallback"]).optional(),
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
