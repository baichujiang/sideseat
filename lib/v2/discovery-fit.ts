import { z } from "zod";
import { SocialIntentTopic, SportTag } from "@prisma/client";
import { normalizeSchoolCode } from "@/lib/constants/schools";
import { compatibleIntentTiming, readTimePreference, type IntentTimingSource } from "./intent-timing";
import { classifyActivityMatch, type ActivityMatchInput, type ActivityMatchClassification } from "./mutual-opportunity-activity-compatibility";

const activitySchema = z.object({
  topic: z.nativeEnum(SocialIntentTopic),
  activityText: z.string().max(80).nullable(),
  studyGoal: z.string().max(80).nullable(),
  sportTag: z.nativeEnum(SportTag).nullable(),
  sportOtherNote: z.string().max(60).nullable(),
});
export const discoveryFitSnapshotSchema = z.object({
  policyVersion: z.literal("DISCOVERY_FIT_V1"),
  basis: z.enum(["EXACT_ACTIVITY", "PARALLEL_STUDY", "RELATED_ACTIVITY", "DIFFERENT_ACTIVITY"]),
  score: z.number().int().min(0).max(100),
  activityPoints: z.number().int().min(0).max(50),
  timePoints: z.number().int().min(0).max(30),
  languagePoints: z.number().int().min(0).max(10),
  schoolPoints: z.number().int().min(0).max(10),
  overlapMinutes: z.number().int().min(30).nullable(),
  differences: z.array(z.enum(["ACTIVITY", "TIME", "TIME_UNDECIDED", "LANGUAGE", "SCHOOL", "COURSE"])),
  intentAActivityText: z.string().max(80).nullable(),
  intentBActivityText: z.string().max(80).nullable(),
  intentAActivity: activitySchema,
  intentBActivity: activitySchema,
});

type DiscoveryIntent = ActivityMatchInput & IntentTimingSource & {
  courseId: string | null;
  user: { school: string | null; userLanguages: Array<{ tag: string }> };
};

/** Soft differences rank published intentions; they never manufacture agreement. */
export function discoveryFit(first: DiscoveryIntent, second: DiscoveryIntent, now: Date) {
  const declaredActivity = (intent: DiscoveryIntent) => intent.topic === "SPORTS" ? intent.sportTag !== null
    : Boolean((intent.topic === "STUDY" ? intent.studyGoal : intent.activityText)?.trim());
  const match = declaredActivity(first) && declaredActivity(second) ? classifyActivityMatch(first, second, true) : null;
  const basis = match?.matchKind === "EXACT_ACTIVITY" ? "EXACT_ACTIVITY"
    : match?.sharedContext === "PARALLEL_STUDY" ? "PARALLEL_STUDY"
      : match ? "RELATED_ACTIVITY" : "DIFFERENT_ACTIVITY";
  const overlap = compatibleIntentTiming(first, second, now);
  const undecided = [first, second].some(intent => readTimePreference(intent.timePreference).kind === "UNDECIDED");
  const activityPoints = basis === "EXACT_ACTIVITY" ? 50 : basis === "PARALLEL_STUDY" ? 35
    : basis === "RELATED_ACTIVITY" ? 25 : first.topic === second.topic ? 10 : 0;
  // Unspecified timing contributes no claimed overlap. It is not a conflict.
  const timePoints = !overlap || undecided ? 0 : overlap.startsAt
    ? Math.min(30, Math.floor((overlap.overlapMinutes ?? 0) / 2)) : 15;
  const languagePoints = first.user.userLanguages.some(left => second.user.userLanguages.some(right => left.tag === right.tag)) ? 10 : 0;
  const school = normalizeSchoolCode(first.user.school);
  const schoolPoints = school !== null && school === normalizeSchoolCode(second.user.school) ? 10 : 0;
  const differences: z.infer<typeof discoveryFitSnapshotSchema>["differences"] = [];
  if (basis !== "EXACT_ACTIVITY") differences.push("ACTIVITY");
  if (!overlap) differences.push("TIME");
  else if (undecided) differences.push("TIME_UNDECIDED");
  if (!languagePoints) differences.push("LANGUAGE");
  if (!schoolPoints) differences.push("SCHOOL");
  if (first.courseId !== second.courseId) differences.push("COURSE");
  const activity = (intent: DiscoveryIntent) => ({
    topic: intent.topic, activityText: intent.activityText, studyGoal: intent.studyGoal,
    sportTag: intent.sportTag, sportOtherNote: intent.sportOtherNote,
  });
  const classification: ActivityMatchClassification = match ?? {
    matchKind: "SHARED_CONTEXT", sharedContext: null,
    first: { togetherMode: first.togetherMode ?? "SAME_ACTIVITY", displayStudyGoal: first.studyGoal },
    second: { togetherMode: second.togetherMode ?? "SAME_ACTIVITY", displayStudyGoal: second.studyGoal },
  };
  return {
    classification,
    timing: overlap ?? {
      startsAt: null, endsAt: null, overlapMinutes: null, certainty: 0,
      expiresAt: new Date(Math.min(first.expiresAt.getTime(), second.expiresAt.getTime(), now.getTime() + 48 * 3600_000)),
      context: { kind: "UNDECIDED" as const, startDate: null, endDate: null, period: "ANY" as const, timeZone: first.timeZone ?? "Europe/Berlin" },
    },
    snapshot: {
      policyVersion: "DISCOVERY_FIT_V1" as const, basis,
      score: activityPoints + timePoints + languagePoints + schoolPoints,
      activityPoints, timePoints, languagePoints, schoolPoints,
      overlapMinutes: overlap?.overlapMinutes ?? null, differences,
      intentAActivityText: first.activityText, intentBActivityText: second.activityText,
      intentAActivity: activity(first), intentBActivity: activity(second),
    },
  };
}
