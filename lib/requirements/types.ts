export type RequirementUserRole = "client" | "developer" | "agentic_tool";

export type RequirementScenario =
  | "initial_discovery"
  | "change_request"
  | "document_review";

export type RequirementArtifactKind =
  | "clarification_questions"
  | "questionnaire"
  | "client_diagram"
  | "developer_srs"
  | "change_summary"
  | "agentic_json";

export type RequirementAgentProvider = "openai" | "deterministic_fallback";

export interface RequirementAgentRequest {
  projectId?: string;
  role: RequirementUserRole;
  scenario: RequirementScenario;
  message: string;
  existingRequirements?: string;
  developerIntent?: string;
  documentText?: string;
  documentId?: string;
  stream?: boolean;
}

export interface ClarificationQuestion {
  id: string;
  question: string;
  reason: string;
  target: RequirementUserRole;
}

export interface RequirementSuggestion {
  id: string;
  title: string;
  rationale: string;
  basedOn: "client_intent" | "developer_intent" | "requirement_gap";
  priority: "high" | "medium" | "low";
}

export interface RequirementItem {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string[];
  priority: "must_have" | "should_have" | "could_have";
}

export interface RequirementArtifact {
  kind: RequirementArtifactKind;
  title: string;
  content: string;
  format: "markdown" | "mermaid" | "json";
}

export interface RequirementAgentResponse {
  projectId: string;
  scenario: RequirementScenario;
  summary: string;
  questions: ClarificationQuestion[];
  suggestions: RequirementSuggestion[];
  requirements: RequirementItem[];
  artifacts: RequirementArtifact[];
  nextAction: string;
  provider?: RequirementAgentProvider;
  retrieval?: {
    used: boolean;
    results: Array<{
      documentId: string;
      chunkId: string;
      fileName: string;
      text: string;
      score: number;
      index: number;
    }>;
  };
}
