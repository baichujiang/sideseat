import { addDays, addWeeks, endOfDay, startOfDay } from "date-fns";

import { berlinEndOfWeek, berlinStartOfWeek } from "@/lib/calendar/schedule-berlin";

export type ShareRangePreset = "this_week" | "next_week" | "seven_days" | "custom";

export function shareRangeForPreset(
  preset: Exclude<ShareRangePreset, "custom">,
  baseNow: Date,
): { start: Date; end: Date } {
  switch (preset) {
    case "this_week":
      return {
        start: berlinStartOfWeek(baseNow),
        end: berlinEndOfWeek(baseNow),
      };
    case "next_week": {
      const anchor = addWeeks(baseNow, 1);
      return {
        start: berlinStartOfWeek(anchor),
        end: berlinEndOfWeek(anchor),
      };
    }
    case "seven_days":
      return {
        start: startOfDay(baseNow),
        end: endOfDay(addDays(baseNow, 6)),
      };
  }
}

export function defaultShareExpiresAt(baseNow: Date): Date {
  return endOfDay(addDays(baseNow, 14));
}

/** True when expiry is end-of-day 14 days after baseNow (default policy). */
export function isDefaultShareExpiry(expires: Date, baseNow: Date): boolean {
  const expected = defaultShareExpiresAt(baseNow);
  return Math.abs(expires.getTime() - expected.getTime()) < 60_000;
}
