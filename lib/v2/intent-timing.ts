import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value => {
  const parsed = new Date(`${value}T12:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}, "Choose a valid calendar date.");

export const intentTimePreferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("EXACT") }).strict(),
  z.object({
    kind: z.literal("FLEXIBLE"),
    startDate: dateSchema,
    endDate: dateSchema,
    period: z.enum(["ANY", "MORNING", "AFTERNOON", "EVENING"]),
  }).strict(),
  z.object({ kind: z.literal("UNDECIDED") }).strict(),
]);
export type IntentTimePreference = z.infer<typeof intentTimePreferenceSchema>;
export type IntentTimingSource = {
  timeWindows: unknown;
  timePreference?: unknown;
  timeZone?: string;
  expiresAt: Date | null;
};
type Window = { startAt: Date; endAt: Date };
export type OpportunityTimeContext = {
  kind: "EXACT" | "FLEXIBLE" | "UNDECIDED";
  startDate: string | null;
  endDate: string | null;
  period: "ANY" | "MORNING" | "AFTERNOON" | "EVENING";
  timeZone: string;
};
const MINUTES_30 = 30 * 60_000;
const HOURS_48 = 48 * 3_600_000;

export function readTimePreference(value: unknown): IntentTimePreference {
  return value == null ? { kind: "EXACT" } : intentTimePreferenceSchema.parse(value);
}

export function flexiblePreferenceFitsLifecycle(
  preference: IntentTimePreference, timeZone: string, now: Date, expiry: Date | null,
): boolean {
  if (preference.kind !== "FLEXIBLE") return true;
  if (preference.startDate > preference.endDate) return false;
  const start = fromZonedTime(`${preference.startDate}T00:00:00`, timeZone);
  const end = fromZonedTime(`${preference.endDate}T23:59:59.999`, timeZone);
  return end > now && (expiry === null || (start <= expiry && end <= expiry)) &&
    preference.startDate >= formatInTimeZone(now, timeZone, "yyyy-MM-dd");
}

function exactWindows(value: unknown): Window[] {
  if (!Array.isArray(value)) return [];
  return value.map(window => ({ startAt: new Date(window.startAt), endAt: new Date(window.endAt) }));
}

function possibleWindows(source: IntentTimingSource): Window[] {
  const preference = readTimePreference(source.timePreference);
  if (preference.kind === "EXACT") return exactWindows(source.timeWindows);
  if (preference.kind === "UNDECIDED") return [];
  const hours = { ANY: [0, 24], MORNING: [6, 12], AFTERNOON: [12, 18], EVENING: [18, 24] }[preference.period]!;
  const windows: Window[] = [];
  for (let day = new Date(`${preference.startDate}T12:00:00Z`);
    day.toISOString().slice(0, 10) <= preference.endDate; day = addDays(day, 1)) {
    const key = day.toISOString().slice(0, 10);
    const nextKey = addDays(day, 1).toISOString().slice(0, 10);
    const zone = source.timeZone ?? "Europe/Berlin";
    windows.push({
      startAt: fromZonedTime(`${key}T${String(hours[0]).padStart(2, "0")}:00:00`, zone),
      endAt: fromZonedTime(hours[1] === 24 ? `${nextKey}T00:00:00`
        : `${key}T${hours[1]}:00:00`, zone),
    });
  }
  return windows;
}

/** Potential date intersection is not declared bilateral availability. */
export function compatibleIntentTiming(first: IntentTimingSource, second: IntentTimingSource, now: Date) {
  const a = readTimePreference(first.timePreference);
  const b = readTimePreference(second.timePreference);
  const exact = a.kind === "EXACT" && b.kind === "EXACT";
  const zone = first.timeZone ?? "Europe/Berlin";
  const horizon = Math.min(first.expiresAt?.getTime() ?? Infinity, second.expiresAt?.getTime() ?? Infinity);
  if (horizon <= now.getTime()) return null;
  const undecided = a.kind === "UNDECIDED" && b.kind === "UNDECIDED";
  if (undecided) {
    return {
      startsAt: null, endsAt: null, overlapMinutes: null, certainty: 0,
      expiresAt: new Date(Math.min(horizon, now.getTime() + HOURS_48)),
      context: { kind: "UNDECIDED" as const, startDate: null, endDate: null, period: "ANY" as const, timeZone: zone },
    };
  }
  const leftWindows = possibleWindows(first);
  const rightWindows = possibleWindows(second);
  // Undecided time imposes no date constraint; it never creates an appointment.
  const left = a.kind === "UNDECIDED" ? rightWindows : leftWindows;
  const right = b.kind === "UNDECIDED" ? leftWindows : rightWindows;
  let best: Window | null = null;
  let lastEnd: Date | null = null;
  let i = 0, j = 0;
  while (i < left.length && j < right.length) {
    const leftWindow = left[i]!, rightWindow = right[j]!;
    const startAt = new Date(Math.max(leftWindow.startAt.getTime(), rightWindow.startAt.getTime(),
      exact ? 0 : now.getTime() + MINUTES_30));
    const endAt = new Date(Math.min(leftWindow.endAt.getTime(), rightWindow.endAt.getTime(), horizon));
    if (leftWindow.endAt <= rightWindow.endAt) i++; else j++;
    if (startAt.getTime() < now.getTime() + MINUTES_30 || endAt.getTime() - startAt.getTime() < MINUTES_30) continue;
    if (!best || startAt < best.startAt) best = { startAt, endAt };
    if (!lastEnd || endAt > lastEnd) lastEnd = endAt;
  }
  if (!best || !lastEnd) return null;
  const periodA = a.kind === "FLEXIBLE" ? a.period : "ANY";
  const periodB = b.kind === "FLEXIBLE" ? b.period : "ANY";
  const context: OpportunityTimeContext = {
    kind: exact ? "EXACT" : "FLEXIBLE",
    startDate: formatInTimeZone(best.startAt, zone, "yyyy-MM-dd"),
    endDate: formatInTimeZone(new Date(lastEnd.getTime() - 1), zone, "yyyy-MM-dd"),
    period: periodA !== "ANY" ? periodA : periodB,
    timeZone: zone,
  };
  const expiry = new Date(Math.min(horizon,
    exact ? best.startAt.getTime() - 15 * 60_000 : Math.min(now.getTime() + HOURS_48, lastEnd.getTime())));
  return {
    startsAt: exact ? best.startAt : null,
    endsAt: exact ? best.endAt : null,
    expiresAt: expiry,
    overlapMinutes: exact ? Math.floor((best.endAt.getTime() - best.startAt.getTime()) / 60_000) : null,
    certainty: exact ? 2 : 1,
    context,
  };
}
