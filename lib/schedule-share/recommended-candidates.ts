import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

import { SCHEDULE_DISPLAY_TZ } from "@/lib/calendar/schedule-berlin";

export type ScheduleShareCandidate = {
  id: string;
  start: Date;
  end: Date;
  bounds: { start: string; end: string };
};

const CANDIDATE_DURATION_MS = 60 * 60 * 1_000;
const CANDIDATE_STEP_MS = 30 * 60 * 1_000;
const DAY_START_MINUTES = 9 * 60;
const DAY_END_MINUTES = 21 * 60;
const PREFERRED_MINUTES = [12 * 60, 15 * 60, 10 * 60, 18 * 60];

export function recommendScheduleShareCandidates(
  slots: readonly { start: string; end: string }[],
  now = new Date(),
): ScheduleShareCandidate[] {
  const generated: ScheduleShareCandidate[] = [];

  for (const bounds of slots) {
    const boundsStart = new Date(bounds.start);
    const boundsEnd = new Date(bounds.end);
    if (!Number.isFinite(boundsStart.getTime()) || boundsEnd.getTime() - boundsStart.getTime() < CANDIDATE_DURATION_MS) {
      continue;
    }

    let dateKey = formatInTimeZone(boundsStart, SCHEDULE_DISPLAY_TZ, "yyyy-MM-dd");
    const finalDateKey = formatInTimeZone(
      new Date(boundsEnd.getTime() - 1),
      SCHEDULE_DISPLAY_TZ,
      "yyyy-MM-dd",
    );

    for (let dayIndex = 0; dayIndex < 32; dayIndex += 1) {
      const daytimeStart = berlinTime(dateKey, DAY_START_MINUTES);
      const daytimeEnd = berlinTime(dateKey, DAY_END_MINUTES);
      const windowStart = new Date(Math.max(boundsStart.getTime(), daytimeStart.getTime(), now.getTime()));
      const windowEnd = new Date(Math.min(boundsEnd.getTime(), daytimeEnd.getTime()));
      let startMs = Math.ceil(windowStart.getTime() / CANDIDATE_STEP_MS) * CANDIDATE_STEP_MS;

      while (startMs + CANDIDATE_DURATION_MS <= windowEnd.getTime()) {
        const start = new Date(startMs);
        generated.push({
          id: `${bounds.start}-${start.toISOString()}`,
          start,
          end: new Date(startMs + CANDIDATE_DURATION_MS),
          bounds,
        });
        startMs += CANDIDATE_STEP_MS;
      }

      if (dateKey === finalDateKey) break;
      dateKey = addDays(new Date(`${dateKey}T12:00:00Z`), 1).toISOString().slice(0, 10);
    }
  }

  generated.sort((left, right) => {
    const leftDay = formatInTimeZone(left.start, SCHEDULE_DISPLAY_TZ, "yyyy-MM-dd");
    const rightDay = formatInTimeZone(right.start, SCHEDULE_DISPLAY_TZ, "yyyy-MM-dd");
    if (leftDay !== rightDay) return leftDay.localeCompare(rightDay);
    const leftScore = preferenceScore(left.start);
    const rightScore = preferenceScore(right.start);
    return leftScore === rightScore
      ? left.start.getTime() - right.start.getTime()
      : leftScore - rightScore;
  });

  const perDay = new Map<string, number>();
  const result: ScheduleShareCandidate[] = [];
  for (const candidate of generated) {
    const day = formatInTimeZone(candidate.start, SCHEDULE_DISPLAY_TZ, "yyyy-MM-dd");
    if ((perDay.get(day) ?? 0) >= 2) continue;
    result.push(candidate);
    perDay.set(day, (perDay.get(day) ?? 0) + 1);
    if (result.length === 5) break;
  }
  return result;
}

function berlinTime(dateKey: string, minuteOfDay: number): Date {
  const hours = String(Math.floor(minuteOfDay / 60)).padStart(2, "0");
  const minutes = String(minuteOfDay % 60).padStart(2, "0");
  return fromZonedTime(`${dateKey}T${hours}:${minutes}:00`, SCHEDULE_DISPLAY_TZ);
}

function preferenceScore(date: Date): number {
  const hour = Number(formatInTimeZone(date, SCHEDULE_DISPLAY_TZ, "H"));
  const minute = Number(formatInTimeZone(date, SCHEDULE_DISPLAY_TZ, "m"));
  const value = hour * 60 + minute;
  return Math.min(
    ...PREFERRED_MINUTES.map((preferred, index) => Math.abs(value - preferred) * 10 + index),
  );
}
