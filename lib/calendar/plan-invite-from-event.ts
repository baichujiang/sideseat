export type PlanInviteParticipant = { userId: string | null; name: string };

export type PlanRequestPrefill = {
  title: string;
  location?: string;
  message?: string;
  startTime: string;
  endTime: string;
};

export type CalendarPlanInviteSource = {
  title: string;
  startISO: string;
  endISO: string;
  location: string | null;
  note: string | null;
};

/** Exactly one active connection companion — required for calendar → plan invite. */
export function singleChatableParticipant(
  participants: PlanInviteParticipant[] | undefined,
): { userId: string; name: string } | null {
  const chatable = (participants ?? []).filter((p): p is { userId: string; name: string } =>
    Boolean(p.userId?.trim()),
  );
  if (chatable.length !== 1) return null;
  return { userId: chatable[0]!.userId, name: chatable[0]!.name };
}

export function calendarDetailToPlanPrefill(source: CalendarPlanInviteSource): PlanRequestPrefill {
  const note = source.note?.trim();
  return {
    title: source.title.trim() || "Plan together",
    location: source.location?.trim() || undefined,
    message: note || undefined,
    startTime: source.startISO,
    endTime: source.endISO,
  };
}
