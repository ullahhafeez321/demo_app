import { NextRequest } from "next/server";
import { z } from "zod";

export const maxJsonRequestBytes = 256 * 1024;
export const maxMultipartRequestBytes = 10 * 1024 * 1024;

export const projectIdSchema = z
  .string()
  .trim()
  .min(1, "Project id is required.")
  .max(80, "Project id must be 80 characters or fewer.")
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]*$/, "Project id may only contain letters, numbers, hyphens, and underscores.");

export function boundedTextSchema(label: string, min: number, max: number) {
  return z
    .string()
    .trim()
    .min(min, `${label} must contain at least ${min} characters.`)
    .max(max, `${label} must be ${max} characters or fewer.`);
}

export function assertRequestSize(request: NextRequest, maxBytes: number) {
  const contentLength = request.headers.get("content-length");
  if (!contentLength) return;

  const size = Number(contentLength);
  if (Number.isFinite(size) && size > maxBytes) {
    throw new GuardrailViolationError(`Request body exceeds the ${formatBytes(maxBytes)} limit.`, "request_too_large");
  }
}

export class GuardrailViolationError extends Error {
  constructor(message: string, public readonly code = "guardrail_violation") {
    super(message);
    this.name = "GuardrailViolationError";
  }
}

function formatBytes(value: number) {
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} bytes`;
}
