import { afterEach, describe, expect, it } from "vitest";

const originalOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  process.env.OPENAI_API_KEY = originalOpenAiKey;
});

describe("agent API behavior", () => {
  it("returns a clear 503 when OpenAI is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    const { POST } = await import("@/app/api/agent/route");
    const request = new Request("http://localhost:3000/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        role: "client",
        scenario: "initial_discovery",
        message: "I want a requirements agent for uploaded PDF documents.",
      }),
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error).toContain("OpenAI API key is missing");
  });

  it("rejects invalid project ids before calling the provider", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const { POST } = await import("@/app/api/agent/route");
    const request = new Request("http://localhost:3000/api/agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: "../bad-project",
        role: "client",
        scenario: "initial_discovery",
        message: "I want a requirements agent for uploaded PDF documents.",
      }),
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("validation_error");
    expect(body.issues[0].path).toBe("projectId");
  });

  it("rejects oversized JSON requests before parsing the provider payload", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const { POST } = await import("@/app/api/agent/route");
    const request = new Request("http://localhost:3000/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Content-Length": String(300 * 1024),
      },
      body: JSON.stringify({
        role: "client",
        scenario: "initial_discovery",
        message: "I want a requirements agent for uploaded PDF documents.",
      }),
    });

    const response = await POST(request as never);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.code).toBe("request_too_large");
  });
});
