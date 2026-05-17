import type { Weekday } from "@prisma/client";
import { endOfWeek, startOfWeek } from "date-fns";
import { formatInTimeZone, toZonedTime } from "date-fns-tz";

/** Home schedule uses German wall time for class recurrence alignment and ICS-friendly dates. */
export const SCHEDULE_DISPLAY_TZ = "Europe/Berlin";

const ISO_DOW_TO_WEEKDAY: Record<number, Weekday> = {
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
  7: "SUN",
};

/** yyyy-MM-dd in Berlin — used for month dots and day matching. */
export function scheduleDateKeyInBerlin(d: Date): string {
  return formatInTimeZone(d, SCHEDULE_DISPLAY_TZ, "yyyy-MM-dd");
}

export function berlinClockMinutes(d: Date): number {
  const H = Number(formatInTimeZone(d, SCHEDULE_DISPLAY_TZ, "H"));
  const M = Number(formatInTimeZone(d, SCHEDULE_DISPLAY_TZ, "m"));
  return H * 60 + M;
}

export function berlinWeekdayFromInstant(d: Date): Weekday {
  const i = Number(formatInTimeZone(d, SCHEDULE_DISPLAY_TZ, "i"));
  return ISO_DOW_TO_WEEKDAY[i] ?? "MON";
}

/** Monday 00:00 in Europe/Berlin for the week containing `instant`. */
export function berlinStartOfWeek(instant: Date): Date {
  const zoned = toZonedTime(instant, SCHEDULE_DISPLAY_TZ);
  return startOfWeek(zoned, { weekStartsOn: 1 });
}

/** Sunday 23:59:59.999 in Europe/Berlin for the week containing `instant`. */
export function berlinEndOfWeek(instant: Date): Date {
  const zoned = toZonedTime(instant, SCHEDULE_DISPLAY_TZ);
  return endOfWeek(zoned, { weekStartsOn: 1 });
}
