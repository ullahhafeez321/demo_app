import type {
  ClarificationQuestion,
  RequirementAgentRequest,
  RequirementAgentResponse,
  RequirementItem,
  RequirementSuggestion,
} from "@/lib/requirements/types";

const vagueTerms = [
  "simple",
  "easy",
  "fast",
  "modern",
  "user friendly",
  "secure",
  "dashboard",
  "ai",
  "automatic",
  "good",
];

export function createRequirementAgentResponse(
  request: RequirementAgentRequest,
): RequirementAgentResponse {
  const projectId = request.projectId ?? createProjectId(request.message);
  const normalizedMessage = normalizeWhitespace(request.message);
  const combinedMessage = [normalizedMessage, request.documentText]
    .filter(Boolean)
    .join("\n\nDocument context:\n");
  const detectedGaps = detectRequirementGaps(combinedMessage);
  const questions = buildClarificationQuestions(request, detectedGaps);
  const suggestions = buildIntentSuggestions(request, detectedGaps);
  const requirements = buildRequirementItems(request, suggestions);
  const summary = buildSummary(request, detectedGaps);

  return {
    projectId,
    scenario: request.scenario,
    summary,
    questions,
    suggestions,
    requirements,
    artifacts: [
      {
        kind: "clarification_questions",
        title: "Clarification Questions",
        content: renderQuestions(questions),
        format: "markdown",
      },
      {
        kind: "questionnaire",
        title: "Client Questionnaire",
        content: renderQuestionnaire(request, questions),
        format: "markdown",
      },
      {
        kind: "client_diagram",
        title: "Client Understanding Diagram",
        content: renderMermaidDiagram(request.scenario),
        format: "mermaid",
      },
      {
        kind: "developer_srs",
        title: "Developer SRS Draft",
        content: renderSrsDraft(request, requirements),
        format: "markdown",
      },
      {
        kind: "change_summary",
        title: "Requirement Change Summary",
        content: renderChangeSummary(request),
        format: "markdown",
      },
      {
        kind: "agentic_json",
        title: "Agentic Coding Tool Payload",
        content: JSON.stringify({ requirements, suggestions }, null, 2),
        format: "json",
      },
    ],
    nextAction:
      questions.length > 0
        ? "Ask the client the clarification questions before generating final implementation tasks."
        : "Convert the requirements into prioritized implementation tasks.",
    provider: "deterministic_fallback",
  };
}

function detectRequirementGaps(message: string) {
  const lower = message.toLowerCase();

  return {
    hasUserRole: /\b(admin|client|customer|developer|manager|user|agent)\b/i.test(message),
    hasWorkflow: /\b(when|after|before|then|flow|process|step|upload|submit|approve)\b/i.test(
      message,
    ),
    hasData: /\b(data|field|pdf|file|document|record|database|json|srs)\b/i.test(message),
    hasSuccessMetric: /\b(success|metric|response time|accuracy|reduce|increase|within)\b/i.test(
      message,
    ),
    vagueTerms: vagueTerms.filter((term) => lower.includes(term)),
  };
}

function buildClarificationQuestions(
  request: RequirementAgentRequest,
  gaps: ReturnType<typeof detectRequirementGaps>,
): ClarificationQuestion[] {
  const questions: ClarificationQuestion[] = [];

  if (!gaps.hasUserRole) {
    questions.push({
      id: "cq_user_roles",
      question: "Who are the primary users, and what should each user be able to do?",
      reason: "User roles define permissions, workflows, and acceptance criteria.",
      target: "client",
    });
  }

  if (!gaps.hasWorkflow) {
    questions.push({
      id: "cq_workflow",
      question: "What is the step-by-step flow from the user's first action to the final result?",
      reason: "A clear workflow prevents developers from guessing behavior.",
      target: "client",
    });
  }

  if (!gaps.hasData) {
    questions.push({
      id: "cq_data",
      question: "What information should the system collect, store, display, or export?",
      reason: "Data requirements shape the database, APIs, and UI forms.",
      target: "developer",
    });
  }

  if (!gaps.hasSuccessMetric) {
    questions.push({
      id: "cq_success",
      question: "How will the client decide that this feature is complete and successful?",
      reason: "Success criteria make the SRS testable.",
      target: request.role === "developer" ? "developer" : "client",
    });
  }

  if (request.scenario === "change_request" && !request.existingRequirements) {
    questions.push({
      id: "cq_change_scope",
      question: "Which existing requirement, screen, or workflow does this change affect?",
      reason: "Change requests need impact analysis before implementation.",
      target: "developer",
    });
  }

  return questions;
}

function buildIntentSuggestions(
  request: RequirementAgentRequest,
  gaps: ReturnType<typeof detectRequirementGaps>,
): RequirementSuggestion[] {
  const suggestions: RequirementSuggestion[] = [];

  suggestions.push({
    id: "sg_client_outcome",
    title: "Restate the client outcome before discussing features",
    rationale:
      "The client intent should be captured as the business result first, then converted into screens, APIs, and tasks.",
    basedOn: "client_intent",
    priority: "high",
  });

  if (request.developerIntent) {
    suggestions.push({
      id: "sg_developer_constraints",
      title: "Validate developer constraints against the requested experience",
      rationale:
        "Developer intent can expose implementation constraints, but it should not silently change the client-facing outcome.",
      basedOn: "developer_intent",
      priority: "high",
    });
  }

  if (gaps.vagueTerms.length > 0) {
    suggestions.push({
      id: "sg_replace_vague_terms",
      title: "Replace vague wording with measurable acceptance criteria",
      rationale: `The request includes vague terms: ${gaps.vagueTerms.join(", ")}.`,
      basedOn: "requirement_gap",
      priority: "medium",
    });
  }

  if (request.scenario === "document_review") {
    suggestions.push({
      id: "sg_trace_document_sources",
      title: "Track each extracted requirement back to the source document",
      rationale:
        "PDF-derived requirements need traceability so the client can verify what the agent understood.",
      basedOn: "requirement_gap",
      priority: "medium",
    });
  }

  return suggestions;
}

function buildRequirementItems(
  request: RequirementAgentRequest,
  suggestions: RequirementSuggestion[],
): RequirementItem[] {
  const sourceRequirements = request.documentText
    ? extractSourceRequirementItems(request.documentText)
    : [];

  return [
    ...sourceRequirements,
    ...(request.documentText
      ? [
          {
            id: "REQ-DOC-001",
            title: "Document-backed requirement review",
            description:
              "The system shall extract, chunk, and review uploaded document text as source context for requirement analysis.",
            acceptanceCriteria: [
              "The document review identifies source-linked requirement findings.",
              "The agent uses uploaded document text when producing clarification questions and SRS output.",
              "Document-derived assumptions remain traceable to the uploaded document context.",
            ],
            priority: "must_have" as const,
          },
        ]
      : []),
    {
      id: "REQ-001",
      title: "Requirement intake and clarification",
      description:
        "The system shall collect the client request, identify missing details, and ask targeted clarification questions.",
      acceptanceCriteria: [
        "The system returns role-specific clarification questions.",
        "The system flags vague or incomplete requirement statements.",
        "The system separates client-facing questions from developer-facing questions.",
      ],
      priority: "must_have",
    },
    {
      id: "REQ-002",
      title: "Intent-based recommendations",
      description:
        "The system shall recommend suggestions based on client intent, developer intent, and detected requirement gaps.",
      acceptanceCriteria: suggestions.map((suggestion) => suggestion.title),
      priority: "must_have",
    },
    {
      id: "REQ-003",
      title: request.scenario === "change_request" ? "Change impact summary" : "SRS draft generation",
      description:
        request.scenario === "change_request"
          ? "The system shall summarize how a new or changed requirement affects the existing scope."
          : "The system shall produce a developer-ready SRS draft from gathered requirements.",
      acceptanceCriteria: [
        "The output includes functional requirements.",
        "The output includes assumptions and open questions.",
        "The output can be used by a developer or agentic coding tool.",
      ],
      priority: "should_have",
    },
  ];
}

function extractSourceRequirementItems(documentText: string): RequirementItem[] {
  const cleanedText = documentText.replace(/\[Source [^\]]+\]/g, " ");
  const sentences = cleanedText
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => normalizeWhitespace(sentence))
    .filter((sentence) => sentence.length > 40);
  const signals = ["must", "shall", "should", "acceptance criteria", "success means", "requested"];
  const seen = new Set<string>();
  const items: RequirementItem[] = [];

  for (const sentence of sentences) {
    const lower = sentence.toLowerCase();
    if (!signals.some((signal) => lower.includes(signal))) {
      continue;
    }

    const title = createRequirementTitle(sentence);
    const key = title.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);

    items.push({
      id: `REQ-SRC-${String(items.length + 1).padStart(3, "0")}`,
      title,
      description: sentence,
      acceptanceCriteria: [
        "Implementation behavior matches the source requirement.",
        "The requirement remains traceable to retrieved document context.",
        "Client or developer acceptance can be verified without rereading the full document.",
      ],
      priority: lower.includes("must") || lower.includes("shall") ? "must_have" : "should_have",
    });

    if (items.length >= 6) {
      break;
    }
  }

  return items;
}

function createRequirementTitle(sentence: string) {
  return sentence
    .replace(/^#+\s*/, "")
    .replace(/^(the system|the portal|developers|admin users|developer users|client users)\s+(must|shall|should|can|requested)?\s*/i, "")
    .trim()
    .slice(0, 90)
    .replace(/[.:;,-]+$/, "");
}

function buildSummary(
  request: RequirementAgentRequest,
  gaps: ReturnType<typeof detectRequirementGaps>,
) {
  const gapCount = Object.values({
    userRole: gaps.hasUserRole,
    workflow: gaps.hasWorkflow,
    data: gaps.hasData,
    successMetric: gaps.hasSuccessMetric,
  }).filter((hasSignal) => !hasSignal).length;

  return `Processed ${request.scenario.replace("_", " ")} request for ${request.role}. Detected ${gapCount} major requirement gap(s) and ${gaps.vagueTerms.length} vague term(s).`;
}

function renderQuestions(questions: ClarificationQuestion[]) {
  if (questions.length === 0) {
    return "No blocking clarification questions detected from the current request.";
  }

  return questions
    .map(
      (question, index) =>
        `${index + 1}. ${question.question}\nReason: ${question.reason}\nTarget: ${question.target}`,
    )
    .join("\n\n");
}

function renderQuestionnaire(request: RequirementAgentRequest, questions: ClarificationQuestion[]) {
  return [
    "# Requirement Intake Questionnaire",
    "",
    `Scenario: ${request.scenario}`,
    `Requester role: ${request.role}`,
    "",
    "## Questions",
    questions.length > 0
      ? questions.map((question) => `- ${question.question}`).join("\n")
      : "- Confirm final acceptance criteria and implementation priority.",
  ].join("\n");
}

function renderMermaidDiagram(scenario: RequirementAgentRequest["scenario"]) {
  const middle =
    scenario === "change_request"
      ? "Analyze Change Impact"
      : scenario === "document_review"
        ? "Extract Requirements From Document"
        : "Clarify Initial Idea";

  return [
    "flowchart TD",
    "  A[Client Intent] --> B[Requirement Agent]",
    `  B --> C[${middle}]`,
    "  C --> D[Clarification Questions]",
    "  C --> E[Client Diagram]",
    "  C --> F[Developer SRS]",
    "  F --> G[Agentic Coding Payload]",
  ].join("\n");
}

function renderSrsDraft(request: RequirementAgentRequest, requirements: RequirementItem[]) {
  return [
    "# Software Requirements Specification Draft",
    "",
    "## Purpose",
    normalizeWhitespace(request.message),
    "",
    ...(request.documentText
      ? ["## Source Document Context", normalizeWhitespace(request.documentText).slice(0, 2000), ""]
      : []),
    "## Functional Requirements",
    ...requirements.flatMap((requirement) => [
      `### ${requirement.id}: ${requirement.title}`,
      requirement.description,
      "",
      "Acceptance Criteria:",
      ...requirement.acceptanceCriteria.map((criteria) => `- ${criteria}`),
      "",
    ]),
    ...(request.documentId
      ? ["## Document Review Context", `Document ID: ${request.documentId}`, ""]
      : []),
    "## Assumptions",
    "- Final priority will be confirmed with the client.",
    "- Non-functional requirements need explicit confirmation.",
  ].join("\n");
}

function renderChangeSummary(request: RequirementAgentRequest) {
  if (request.scenario !== "change_request") {
    return "No active change request. Use this artifact when the client introduces new or modified scope during development.";
  }

  return [
    "# Change Summary",
    "",
    "## Requested Change",
    normalizeWhitespace(request.message),
    "",
    "## Existing Context",
    request.existingRequirements
      ? normalizeWhitespace(request.existingRequirements)
      : "Existing requirements were not provided.",
    "",
    "## Impact Review",
    "- Confirm affected screens, APIs, data models, and acceptance criteria.",
    "- Reconfirm delivery priority before implementation starts.",
  ].join("\n");
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function createProjectId(message: string) {
  const slug = normalizeWhitespace(message)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);

  return `req-${slug || "project"}`;
}
