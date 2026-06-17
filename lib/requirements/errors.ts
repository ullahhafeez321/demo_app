export class RequirementAgentConfigurationError extends Error {
  constructor(message = "OpenAI is not configured for the requirement agent.") {
    super(message);
    this.name = "RequirementAgentConfigurationError";
  }
}

export class RequirementAgentProviderError extends Error {
  constructor(message = "The AI requirement agent is temporarily unavailable.") {
    super(message);
    this.name = "RequirementAgentProviderError";
  }
}
