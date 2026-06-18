import { z } from "zod";

import { boundedTextSchema, projectIdSchema } from "@/lib/api/guardrails";

export const ragSearchRequestSchema = z.object({
  projectId: projectIdSchema,
  query: boundedTextSchema("Retrieval query", 3, 1000),
  limit: z.number().int().min(1).max(10).optional(),
});
