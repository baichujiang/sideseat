import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

export type WeeklyIntentWindow = Readonly<{
  startAt: string;
  endAt: string;
}>;

export function weeklyIntentExpiry(timeZone: string, now = new Date()): Date {
  const zoned = toZonedTime(now, timeZone);
  const daysUntilSunday = (7 - zoned.getDay()) % 7;
  const target = addDays(zoned, daysUntilSunday);
  const dateKey = formatInTimeZone(target, timeZone, "yyyy-MM-dd");
  return fromZonedTime(`${dateKey}T23:59:59.999`, timeZone);
}

export function normalizeWeeklyIntentWindows(
  windows: readonly WeeklyIntentWindow[],
) {
  return windows
    .map((window) => ({
      startAt: new Date(window.startAt).toISOString(),
      endAt: new Date(window.endAt).toISOString(),
    }))
    .sort((a, b) => a.startAt.localeCompare(b.startAt));
}

export function weeklyIntentWindowsFitLifecycle(
  windows: readonly WeeklyIntentWindow[],
  now: Date,
  expiresAt: Date,
): boolean {
  return windows.every((window) => {
    const startAt = new Date(window.startAt);
    const endAt = new Date(window.endAt);
    return startAt > now && endAt <= expiresAt;
  });
}

