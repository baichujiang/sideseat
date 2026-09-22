export type ScheduleWeekday = "MON" | "TUE" | "WED" | "THU" | "FRI" | "SAT" | "SUN";

export type ScheduleRepeatRule =
  | "NONE"
  | "DAILY"
  | "WEEKLY"
  | "BIWEEKLY"
  | "MONTHLY"
  | "YEARLY";

export type SchedulePlanType = "STUDY" | "MEAL" | "SPORTS" | "LANGUAGE" | "CUSTOM";

export type HomeClassBlock = {
  courseId: string;
  courseName: string;
  courseCode: string | null;
  weekday: ScheduleWeekday;
  startMinute: number;
  endMinute: number;
  location: string | null;
  categoryColor: string | null;
  categoryId: string | null;
  categoryName: string | null;
};

export type HomeStudyEntry = {
  id: string;
  title: string;
  location: string | null;
  withLabel: string | null;
  note: string | null;
  repeatRule: ScheduleRepeatRule;
  repeatUntilISO: string | null;
  eventParticipants: Array<{ userId: string | null; name: string }>;
  eventType?: SchedulePlanType | null;
  startISO: string;
  endISO: string;
  categoryId: string | null;
  categoryColor: string | null;
  categoryName: string | null;
  discoverActivityId?: string | null;
  planCommitmentId?: string | null;
  planConnectionId?: string | null;
  planRevisionId?: string | null;
};

export type HomeCalendarCategory = {
  id: string;
  name: string;
  color: string;
  presetKey: string | null;
  icsSubscriptionUrl: string | null;
};

export type HomeCompanionOption = {
  id: string;
  name: string;
  avatarUrl: string | null;
};

export type HomeSchedulePayload = {
  classBlocks: HomeClassBlock[];
  studyEntries: HomeStudyEntry[];
  companionOptions: HomeCompanionOption[];
  initialCalendarCategories: HomeCalendarCategory[];
};

export function homeSchedulePlanProjectionFields(entry: {
  planCommitmentId: string | null;
  planRequestId: string | null;
  planCommitment: { connectionId: string } | null;
  planRequest: { connectionId: string } | null;
}) {
  const commitmentID = entry.planCommitmentId;
  const revisionID = entry.planRequestId;
  const connectionID =
    entry.planCommitment?.connectionId ?? entry.planRequest?.connectionId ?? null;
  const hasExplicitPlanIdentity =
    Boolean(connectionID) && Boolean(commitmentID || revisionID);

  return {
    planCommitmentId: commitmentID,
    planConnectionId: hasExplicitPlanIdentity ? connectionID : null,
    planRevisionId: hasExplicitPlanIdentity ? revisionID : null,
  };
}
