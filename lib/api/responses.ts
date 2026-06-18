import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function validationErrorResponse(message: string, error: ZodError, code = "validation_error") {
  return NextResponse.json(
    {
      error: message,
      code,
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400 },
  );
}

export function badRequestResponse(message: string, code = "bad_request") {
  return NextResponse.json({ error: message, code }, { status: 400 });
}

export function serverErrorResponse(message = "Unable to process request.", code = "server_error") {
  return NextResponse.json({ error: message, code }, { status: 500 });
}

export function serviceUnavailableResponse(message: string, code = "service_unavailable") {
  return NextResponse.json({ error: message, code }, { status: 503 });
}

export function guardrailErrorResponse(message: string, code = "guardrail_violation") {
  return NextResponse.json({ error: message, code }, { status: 400 });
}
