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
});
