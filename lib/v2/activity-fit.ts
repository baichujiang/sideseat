import { z } from "zod";

import type { ActivityMatchClassification } from "./mutual-opportunity-activity-compatibility";
import { discoveryFitSnapshotSchema } from "./discovery-fit";

const legacyActivityFitSnapshotSchema = z.object({
  policyVersion: z.literal("ACTIVITY_FIT_V1"),
  basis: z.enum(["EXACT_ACTIVITY", "PARALLEL_STUDY", "RELATED_ACTIVITY"]),
  score: z.number().int().min(0).max(100),
  activityPoints: z.number().int().min(0).max(50),
  timePoints: z.number().int().min(0).max(30),
  languagePoints: z.literal(10),
  schoolPoints: z.literal(10),
  overlapMinutes: z.number().int().min(30),
  intentAActivityText: z.string().max(80).nullable(),
  intentBActivityText: z.string().max(80).nullable(),
});
const activityFitSnapshotSchema = z.union([
  discoveryFitSnapshotSchema,
  legacyActivityFitSnapshotSchema,
  legacyActivityFitSnapshotSchema.extend({
    policyVersion: z.literal("ACTIVITY_FIT_V2"),
    timePoints: z.null(),
    overlapMinutes: z.number().int().min(30).nullable(),
  }),
]);

/** An explainable activity-fit heuristic, never a person's rating or probability. */
export function activityFit(
  match: ActivityMatchClassification,
  overlapMinutes: number | null,
  separateTiming = false,
) {
  const basis =
    match.matchKind === "EXACT_ACTIVITY"
      ? "EXACT_ACTIVITY"
      : match.sharedContext === "PARALLEL_STUDY"
        ? "PARALLEL_STUDY"
        : "RELATED_ACTIVITY";
  const activityPoints =
    basis === "EXACT_ACTIVITY" ? 50 : basis === "PARALLEL_STUDY" ? 35 : 25;
  const timePoints = overlapMinutes === null || separateTiming ? null : Math.min(30, Math.floor(overlapMinutes / 2));
  return {
    policyVersion: timePoints === null ? "ACTIVITY_FIT_V2" as const : "ACTIVITY_FIT_V1" as const,
    basis,
    score: timePoints === null ? Math.round((activityPoints + 20) / 70 * 100) : activityPoints + timePoints + 20,
    activityPoints,
    timePoints,
    languagePoints: 10 as const,
    schoolPoints: 10 as const,
    overlapMinutes: overlapMinutes === null ? null : Math.floor(overlapMinutes),
  };
}

export function activityFitProjection(snapshot: unknown, viewerIsA: boolean) {
  if (!snapshot || typeof snapshot !== "object" || !("activityFit" in snapshot))
    return null;
  const parsed = activityFitSnapshotSchema.safeParse(snapshot.activityFit);
  if (!parsed.success) return null;
  const { intentAActivityText, intentBActivityText, ...fit } = parsed.data;
  if (fit.policyVersion === "DISCOVERY_FIT_V1") {
    const { intentAActivity, intentBActivity, ...publicFit } = fit;
    return {
      ...publicFit,
      viewerActivityText: viewerIsA ? intentAActivityText : intentBActivityText,
      peerActivityText: viewerIsA ? intentBActivityText : intentAActivityText,
      viewerActivity: viewerIsA ? intentAActivity : intentBActivity,
      peerActivity: viewerIsA ? intentBActivity : intentAActivity,
    };
  }
  return {
    ...fit,
    viewerActivityText: viewerIsA ? intentAActivityText : intentBActivityText,
    peerActivityText: viewerIsA ? intentBActivityText : intentAActivityText,
  };
}
