import { addDays, addMonths, addWeeks, addYears } from "date-fns";
import { fromZonedTime, toZonedTime } from "date-fns-tz";

import { SCHEDULE_DISPLAY_TZ } from "@/lib/calendar/schedule-berlin";
import type { CalendarEventInput } from "@/lib/validators/calendar";

export type CalendarOccurrence = {
  startAt: Date;
  endAt: Date;
};

type RepeatRule = CalendarEventInput["repeat"];

function occurrenceLocalStart(anchor: Date, repeat: RepeatRule, index: number) {
  const localAnchor = toZonedTime(anchor, SCHEDULE_DISPLAY_TZ);
  if (repeat === "DAILY") return addDays(localAnchor, index);
  if (repeat === "WEEKLY") return addWeeks(localAnchor, index);
  if (repeat === "BIWEEKLY") return addWeeks(localAnchor, index * 2);
  if (repeat === "MONTHLY") return addMonths(localAnchor, index);
  if (repeat === "YEARLY") return addYears(localAnchor, index);
  return localAnchor;
}

/** Expands a logical event while preserving its Europe/Berlin wall-clock start. */
export function expandCalendarRecurrence(
  values: Pick<CalendarEventInput, "startAt" | "endAt" | "repeat" | "repeatUntil">,
  maxOccurrences = 120,
): CalendarOccurrence[] {
  const startAt = new Date(values.startAt);
  const endAt = new Date(values.endAt);
  const repeatUntil = values.repeatUntil ? new Date(values.repeatUntil) : null;
  const durationMs = endAt.getTime() - startAt.getTime();
  const occurrences: CalendarOccurrence[] = [];

  for (let index = 0; index < maxOccurrences; index += 1) {
    const occurrenceStart =
      index === 0
        ? new Date(startAt)
        : fromZonedTime(
            occurrenceLocalStart(startAt, values.repeat, index),
            SCHEDULE_DISPLAY_TZ,
          );
    if (values.repeat !== "NONE" && repeatUntil && occurrenceStart > repeatUntil) break;
    occurrences.push({
      startAt: occurrenceStart,
      endAt: new Date(occurrenceStart.getTime() + durationMs),
    });
    if (values.repeat === "NONE") break;
  }

  return occurrences;
}
