import { describe, expect, it } from "vitest";

import { createRequirementAgentResponse } from "@/lib/requirements/agent";

describe("deterministic requirement agent", () => {
  it("returns clarification questions, suggestions, artifacts, and fallback provider", () => {
    const response = createRequirementAgentResponse({
      role: "client",
      scenario: "initial_discovery",
      message: "I want an AI dashboard for PDF requirements.",
      developerIntent: "Build it with Next.js API routes.",
    });

    expect(response.provider).toBe("deterministic_fallback");
    expect(response.questions.length).toBeGreaterThan(0);
    expect(response.suggestions.some((item) => item.basedOn === "developer_intent")).toBe(true);
    expect(response.artifacts.map((artifact) => artifact.kind)).toContain("developer_srs");
  });

  it("extracts concrete source requirements from document text", () => {
    const response = createRequirementAgentResponse({
      role: "developer",
      scenario: "document_review",
      message: "Review uploaded requirements for implementation planning.",
      documentText:
        "The portal shall generate a developer-ready SRS with source-linked findings. Admin users must manage uploaded documents.",
    });

    expect(response.requirements.some((item) => item.id.startsWith("REQ-SRC-"))).toBe(true);
    expect(response.requirements.map((item) => item.title).join(" ")).toContain("developer-ready SRS");
  });

  it("includes document context in SRS output when document text is provided", () => {
    const response = createRequirementAgentResponse({
      role: "developer",
      scenario: "document_review",
      message: "Review the uploaded source document for implementation requirements.",
      documentId: "doc-test",
      documentText: "The system shall extract PDF text and return source-linked findings.",
    });
    const srs = response.artifacts.find((artifact) => artifact.kind === "developer_srs");

    expect(srs?.content).toContain("Source Document Context");
    expect(srs?.content).toContain("doc-test");
  });
});
