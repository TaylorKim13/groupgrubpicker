import { z } from "zod";
export const CreationClickSchema = z.object({
  journeyId: z.string().uuid(),
  clicks: z.number().int().min(0).max(1000000),
});
