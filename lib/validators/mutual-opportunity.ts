import { z } from "zod";

export const mutualOpportunityDecisionSchema = z
  .object({
    decision: z.enum(["YES", "NO"]),
  })
  .strict();

