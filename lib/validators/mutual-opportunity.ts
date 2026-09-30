import { z } from "zod";

export const mutualOpportunityDecisionSchema = z
  .object({
    decision: z.enum(["YES", "NO"]),
  })
  .strict();


export const opportunityInteractionSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("BOOKMARK") }).strict(),
  z.object({ action: z.literal("UNBOOKMARK") }).strict(),
  z.object({ action: z.literal("SEND"), body: z.string().trim().min(1).max(500) }).strict(),
  z.object({ action: z.literal("REPLY"), body: z.string().trim().min(1).max(500) }).strict(),
  z.object({ action: z.literal("IGNORE") }).strict(),
]);
