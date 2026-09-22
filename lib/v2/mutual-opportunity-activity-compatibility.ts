import type { SocialIntentTopic, SportTag } from "@prisma/client";

export type TogetherModeValue = "SAME_ACTIVITY" | "PARALLEL" | "EITHER";
export type MutualOpportunityMatchKindValue =
  | "EXACT_ACTIVITY"
  | "SHARED_CONTEXT";
export type MutualOpportunitySharedContextValue = "PARALLEL_STUDY";

export type ActivityMatchInput = Readonly<{
  topic: SocialIntentTopic;
  activityText: string | null;
  sportTag: SportTag | null;
  sportOtherNote: string | null;
  togetherMode: TogetherModeValue | null;
  studyGoal: string | null;
}>;

export type ActivityMatchClassification = Readonly<{
  matchKind: MutualOpportunityMatchKindValue;
  sharedContext: MutualOpportunitySharedContextValue | null;
  first: Readonly<{
    togetherMode: TogetherModeValue;
    displayStudyGoal: string | null;
  }>;
  second: Readonly<{
    togetherMode: TogetherModeValue;
    displayStudyGoal: string | null;
  }>;
}>;

export function normalizeSportOtherNote(value: string | null): string | null {
  const normalized = value
    ?.normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
  return normalized ? normalized : null;
}

/**
 * Concrete sports never fall back to the broad SPORTS category. Nullable
 * values exist only for pre-concrete-activity TestFlight intents: two legacy
 * rows may still meet, while a legacy row never consumes a new concrete one.
 */
export function sportIntentsAreCompatible(
  first: Readonly<{ sportTag: SportTag | null; sportOtherNote: string | null }>,
  second: Readonly<{ sportTag: SportTag | null; sportOtherNote: string | null }>,
): boolean {
  if (first.sportTag === null || second.sportTag === null) {
    return first.sportTag === null && second.sportTag === null;
  }
  if (first.sportTag !== second.sportTag) return false;
  if (first.sportTag !== "OTHER") return true;
  const firstOther = normalizeSportOtherNote(first.sportOtherNote);
  const secondOther = normalizeSportOtherNote(second.sportOtherNote);
  return firstOther !== null && firstOther === secondOther;
}

export function displayStudyGoal(value: string | null): string | null {
  const display = value
    ?.normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  return display ? display : null;
}

export function normalizeStudyGoal(value: string | null): string | null {
  return displayStudyGoal(value)?.toLocaleLowerCase("en-US") ?? null;
}

export function displayActivityText(value: string | null): string | null {
  const display = value
    ?.normalize("NFKC")
    .trim()
    .replace(/\s+/g, " ");
  return display ? display : null;
}

export function normalizeActivityText(value: string | null): string | null {
  return displayActivityText(value)?.toLocaleLowerCase("en-US") ?? null;
}

/**
 * Checks exact normalized wording before the optional related-category pass.
 * Two NULL values remain compatible solely for intents
 * created before concrete general activities were introduced.
 */
export function generalActivityTextsAreCompatible(
  first: string | null,
  second: string | null,
): boolean {
  const firstActivity = normalizeActivityText(first);
  const secondActivity = normalizeActivityText(second);
  if (firstActivity === null || secondActivity === null) {
    return firstActivity === null && secondActivity === null;
  }
  return firstActivity === secondActivity;
}

export function effectiveTogetherMode(
  value: TogetherModeValue | null,
): TogetherModeValue {
  return value ?? "SAME_ACTIVITY";
}

function allowsParallel(value: TogetherModeValue): boolean {
  return value === "PARALLEL" || value === "EITHER";
}

function exact(
  first: ActivityMatchInput,
  second: ActivityMatchInput,
): ActivityMatchClassification {
  return {
    matchKind: "EXACT_ACTIVITY",
    sharedContext: null,
    first: {
      togetherMode: effectiveTogetherMode(first.togetherMode),
      displayStudyGoal: displayStudyGoal(first.studyGoal),
    },
    second: {
      togetherMode: effectiveTogetherMode(second.togetherMode),
      displayStudyGoal: displayStudyGoal(second.studyGoal),
    },
  };
}

/**
 * Classifies the user-facing reason two private intents can meet. Course and
 * time-window compatibility stay in the matcher; this function owns only the
 * activity-vs-shared-context semantics.
 */
export function classifyActivityMatch(
  first: ActivityMatchInput,
  second: ActivityMatchInput,
  allowRelatedActivities = false,
): ActivityMatchClassification | null {
  if (first.topic !== second.topic) return null;

  if (first.topic === "SPORTS") {
    return sportIntentsAreCompatible(first, second)
      ? exact(first, second)
      : null;
  }

  if (first.topic !== "STUDY") {
    if (generalActivityTextsAreCompatible(
      first.activityText,
      second.activityText,
    )) return exact(first, second);
    // A shared category is an invitation to coordinate, not a claim that the
    // concrete activities agree. Preserve both descriptions for the decision.
    if (allowRelatedActivities && displayActivityText(first.activityText) &&
      displayActivityText(second.activityText)) {
      return { ...exact(first, second), matchKind: "SHARED_CONTEXT" };
    }
    return null;
  }

  const firstGoal = normalizeStudyGoal(first.studyGoal);
  const secondGoal = normalizeStudyGoal(second.studyGoal);
  // Two pre-goal intents remain compatible. A legacy intent never consumes a
  // new, explicit study goal because the opportunity would be unexplainable.
  if (firstGoal === null || secondGoal === null) {
    return firstGoal === null && secondGoal === null
      ? exact(first, second)
      : null;
  }
  if (firstGoal === secondGoal) return exact(first, second);

  const firstMode = effectiveTogetherMode(first.togetherMode);
  const secondMode = effectiveTogetherMode(second.togetherMode);
  if (!allowsParallel(firstMode) || !allowsParallel(secondMode)) return null;

  return {
    matchKind: "SHARED_CONTEXT",
    sharedContext: "PARALLEL_STUDY",
    first: {
      togetherMode: firstMode,
      displayStudyGoal: displayStudyGoal(first.studyGoal),
    },
    second: {
      togetherMode: secondMode,
      displayStudyGoal: displayStudyGoal(second.studyGoal),
    },
  };
}
