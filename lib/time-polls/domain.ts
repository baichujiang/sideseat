import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { z } from "zod";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");
export const pollCollaborationInputSchema = z.object({
  activity: z.boolean(), location: z.boolean(), time: z.boolean(),
  activityType: z.string().trim().max(120).optional(),
  activityOptions: z.array(z.string().trim().min(1).max(120)).max(20),
  locationOptions: z.array(z.string().trim().min(1).max(120)).max(20),
}).strict();
export const createTimePollSchema = z.object({
  title: z.string().trim().min(1).max(120),
  timeZone: z.string().max(80).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "Choose a valid time zone."),
  dates: z.array(dateKey).min(1).max(31),
  startMinute: z.number().int().min(0).max(1425).multipleOf(15),
  endMinute: z.number().int().min(15).max(1440).multipleOf(15),
  location: z.string().trim().max(200).optional(),
  durationMinutes: z.number().int().min(30).max(480).multipleOf(15).optional(),
  expectedCount: z.number().int().min(2).max(2147483647).optional(),
  planningMode: z.enum(["COLLECT", "FIXED"]).optional(),
  fixedStart: z.string().datetime().optional(),
  chooseActivityTogether: z.boolean().optional(),
  collaboration: pollCollaborationInputSchema.optional(),
}).strict().refine((value) => value.endMinute > value.startMinute, { path: ["endMinute"], message: "End time must follow start time." });

export const suggestPollActivitySchema = z.object({
  title: z.string().trim().min(1).max(120),
  location: z.string().trim().max(200).optional(),
}).strict();
export const updateTimePollDetailsSchema = suggestPollActivitySchema;
export const pollActivityInterestSchema = z.object({
  ideaId: z.string().cuid(), interested: z.boolean(),
}).strict();
export const choosePollActivitySchema = z.object({ ideaId: z.string().cuid() }).strict();
export const suggestPollOptionSchema = z.object({ kind: z.enum(["ACTIVITY", "LOCATION"]), value: z.string().trim().min(1).max(120) }).strict();
export const pollOptionInterestSchema = z.object({ optionId: z.string().cuid(), interested: z.boolean() }).strict();
export const pollPreferencesSchema = z.object({
  optionIds: z.array(z.string().cuid()).max(40),
  slotIds: z.array(z.number().int().min(0)).max(3100).optional(),
}).strict();
export const saveTimePollResponseSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  slotIds: z.array(z.number().int().min(0)).max(3100),
}).strict();
export const timePollDisplayNameSchema = z.object({ displayName: saveTimePollResponseSchema.shape.displayName }).strict();

export const sharePollContactsSchema = z.object({
  connectionIds: z.array(z.string().cuid()).min(1).max(19),
  version: z.number().int().min(0),
}).strict();

export type PollSlot = { id: number; date: string; row: string; label: string; start: string; end: string };
export type PollParticipant = { id: string; displayName: string; slotIds: number[]; isMe: boolean };
export type PollWindow = { start: string; end: string; attendeeIds: string[]; count: number };

export const sendPollInvitationsSchema = z.object({
  start: z.string().datetime(),
  end: z.string().datetime().optional(),
  attendeeIds: z.array(z.string().min(1).max(100)),
  version: z.number().int().min(0),
  // Omitted keeps the existing closed-roster contract; null opens the link without a cap.
  linkParticipantCount: z.number().int().min(2).max(2147483647).nullable().optional(),
  arrangement: z.object({
    title: z.string().trim().min(1).max(120),
    activityType: z.string().trim().min(1).max(120),
    location: z.string().trim().max(200),
  }).strict().optional(),
}).strict().refine((value) => value.attendeeIds.length > 0 || value.linkParticipantCount !== undefined, { path: ["attendeeIds"], message: "Choose invitees or a participant count for the invitation link." })
  .refine((value) => !value.end || new Date(value.end) > new Date(value.start), { path: ["end"], message: "End time must follow start time." });
export const respondPollInvitationSchema = z.object({
  status: z.enum(["ACCEPTED", "DECLINED"]),
  version: z.number().int().min(1),
}).strict();
export const cancelPollPlanSchema = z.object({ version: z.number().int().min(1) }).strict();

export function buildPollSlots(input: Pick<z.infer<typeof createTimePollSchema>, "dates" | "timeZone" | "startMinute" | "endMinute">): PollSlot[] {
  const slots: PollSlot[] = [];
  const clock = (minute: number) => `${String(Math.floor(minute / 60)).padStart(2, "0")}:${String(minute % 60).padStart(2, "0")}`;
  for (const date of [...new Set(input.dates)].sort()) {
    const nextDay = new Date(date + "T12:00:00Z"); nextDay.setUTCDate(nextDay.getUTCDate() + 1);
    const start = fromZonedTime(`${date}T${clock(input.startMinute)}:00`, input.timeZone);
    const end = fromZonedTime(input.endMinute === 1440 ? `${nextDay.toISOString().slice(0, 10)}T00:00:00` : `${date}T${clock(input.endMinute)}:00`, input.timeZone);
    const occurrences = new Map<string, number>();
    for (let instant = start.getTime(); instant < end.getTime(); instant += 900_000) {
      const label = formatInTimeZone(instant, input.timeZone, "HH:mm");
      const ordinal = occurrences.get(label) ?? 0; occurrences.set(label, ordinal + 1);
      slots.push({ id: slots.length, date, row: `${label}-${ordinal}`, label: ordinal ? `${label} ${formatInTimeZone(instant, input.timeZone, "XXX")}` : label, start: new Date(instant).toISOString(), end: new Date(instant + 900_000).toISOString() });
    }
  }
  return slots;
}

/** Consecutive cells merge only when the same people can attend the whole window. */
// Final invitations may include hours not surveyed for availability. They must still
// be quarter-aligned and continuous across the plan's actual candidate dates.
export function isPollInvitationWindow(dates: string[], timeZone: string, start: Date, end: Date): boolean {
  if (!(end > start) || start.getTime() % 900_000 !== 0 || end.getTime() % 900_000 !== 0) return false;
  const first = formatInTimeZone(start, timeZone, "yyyy-MM-dd");
  const last = formatInTimeZone(new Date(end.getTime() - 1), timeZone, "yyyy-MM-dd");
  const range = buildPollSlots({ dates: dates.filter(date => date >= first && date <= last), timeZone, startMinute: 0, endMinute: 1440 })
    .filter(slot => slot.start >= start.toISOString() && slot.end <= end.toISOString());
  return range.length > 0 && range[0].start === start.toISOString() && range.at(-1)!.end === end.toISOString()
    && range.every((slot, index) => index === 0 || range[index - 1].end === slot.start);
}

export function summarizePoll(slots: PollSlot[], participants: PollParticipant[], durationMinutes?: number | null, expectedCount?: number | null) {
  const selections = participants.map((person) => new Set(person.slotIds));
  const attendance = slots.map((slot) => participants.filter((_, index) => selections[index].has(slot.id)).map((person) => person.id).sort());
  let maximum = Math.max(0, ...attendance.map((ids) => ids.length));
  const windows: PollWindow[] = [];
  if (durationMinutes) {
    const length = durationMinutes / 15;
    for (let index = 0; index + length <= slots.length; index++) {
      const slice = slots.slice(index, index + length);
      if (slice.some((slot, offset) => slot.date !== slice[0].date || (offset > 0 && slice[offset - 1].end !== slot.start))) continue;
      const ids = attendance[index].filter((id) => slice.every((slot) => attendance[slot.id].includes(id)));
      if (ids.length) windows.push({ start: slice[0].start, end: slice.at(-1)!.end, attendeeIds: ids, count: ids.length });
    }
    maximum = Math.max(0, ...windows.map((window) => window.count));
    return { counts: attendance.map((ids) => ids.length), participantCount: participants.length, maximum,
      common: maximum > 0 && maximum === participants.length && (!expectedCount || participants.length >= expectedCount),
      windows: windows.filter((window) => window.count === maximum) };
  }
  for (let index = 0; index < slots.length; index++) {
    const ids = attendance[index], slot = slots[index];
    if (!ids.length || ids.length !== maximum) continue;
    const previous = windows.at(-1);
    if (previous && previous.end === slot.start && slots[index - 1]?.date === slot.date && previous.attendeeIds.join(",") === ids.join(",")) previous.end = slot.end;
    else windows.push({ start: slot.start, end: slot.end, attendeeIds: ids, count: ids.length });
  }
  return { counts: attendance.map((ids) => ids.length), participantCount: participants.length, maximum, common: maximum > 0 && maximum === participants.length && (!expectedCount || participants.length >= expectedCount), windows };
}
