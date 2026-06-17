import { z } from "zod";

export const ragSearchRequestSchema = z.object({
  projectId: z.string().min(1),
  query: z.string().min(3),
  limit: z.number().int().min(1).max(10).optional(),
});
