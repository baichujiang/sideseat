import { createHash } from "crypto";
import type { ExperimentVariant } from "@prisma/client";

export function stableExperimentVariant(
  userId: string,
  experimentKey: string,
): ExperimentVariant {
  const digest = createHash("sha256")
    .update(`${experimentKey}:${userId}`)
    .digest();
  return (digest[0] ?? 0) % 2 === 0 ? "CONTROL" : "TREATMENT";
}
