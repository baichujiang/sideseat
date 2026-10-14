import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { z } from "zod";

const dateKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => {
  const date = new Date(value + "T12:00:00Z");
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}, "Choose a valid date.");
export const createTimePollSchema = z.object({
  title: z.string().trim().min(1).max(120),
  timeZone: z.string().max(80).refine((value) => {
    try { new Intl.DateTimeFormat("en", { timeZone: value }); return true; } catch { return false; }
  }, "Choose a valid time zone."),
  dates: z.array(dateKey).min(1).max(31),
  startMinute: z.number().int().min(0).max(1425).multipleOf(15),
  endMinute: z.number().int().min(15).max(1440).multipleOf(15),
}).strict().refine((value) => value.endMinute > value.startMinute, { path: ["endMinute"], message: "End time must follow start time." });
export const saveTimePollResponseSchema = z.object({
  displayName: z.string().trim().min(1).max(60),
  slotIds: z.array(z.number().int().min(0)).max(3100),
}).strict();

export type PollSlot = { id: number; date: string; row: string; label: string; start: string; end: string };
export type PollParticipant = { id: string; displayName: string; slotIds: number[]; isMe: boolean };
export type PollWindow = { start: string; end: string; attendeeIds: string[]; count: number };

export function buildPollSlots(input: z.infer<typeof createTimePollSchema>): PollSlot[] {
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
export function summarizePoll(slots: PollSlot[], participants: PollParticipant[]) {
  const selections = participants.map((person) => new Set(person.slotIds));
  const attendance = slots.map((slot) => participants.filter((_, index) => selections[index].has(slot.id)).map((person) => person.id).sort());
  const maximum = Math.max(0, ...attendance.map((ids) => ids.length));
  const windows: PollWindow[] = [];
  for (let index = 0; index < slots.length; index++) {
    const ids = attendance[index], slot = slots[index];
    if (!ids.length || ids.length !== maximum) continue;
    const previous = windows.at(-1);
    if (previous && previous.end === slot.start && slots[index - 1]?.date === slot.date && previous.attendeeIds.join(",") === ids.join(",")) previous.end = slot.end;
    else windows.push({ start: slot.start, end: slot.end, attendeeIds: ids, count: ids.length });
  }
  return { counts: attendance.map((ids) => ids.length), participantCount: participants.length, maximum, common: maximum > 0 && maximum === participants.length, windows };
}
