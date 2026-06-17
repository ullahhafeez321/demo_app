import { NextResponse } from "next/server";
import { ZodError } from "zod";

export function validationErrorResponse(message: string, error: ZodError) {
  return NextResponse.json(
    {
      error: message,
      issues: error.issues.map((issue) => ({
        path: issue.path.join("."),
        message: issue.message,
      })),
    },
    { status: 400 },
  );
}

export function badRequestResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function serverErrorResponse(message = "Unable to process request.") {
  return NextResponse.json({ error: message }, { status: 500 });
}

export function serviceUnavailableResponse(message: string) {
  return NextResponse.json({ error: message }, { status: 503 });
}
