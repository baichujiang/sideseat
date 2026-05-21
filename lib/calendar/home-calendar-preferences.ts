import {
  clampWeekCalendarMinuteScale,
  clampWeekCalendarVisibleDayCount,
  WEEK_CALENDAR_MINUTE_SCALE_DEFAULT,
  WEEK_CALENDAR_VISIBLE_DAY_MIN,
  WEEK_CALENDAR_VISIBLE_DAYS_DEFAULT,
} from "@/lib/calendar/week-calendar-constants";

export const HOME_CALENDAR_VISIBLE_DAYS_DEFAULT = WEEK_CALENDAR_VISIBLE_DAYS_DEFAULT;
export const HOME_CALENDAR_VISIBLE_DAYS_STORAGE_KEY = "homeCalendarVisibleDays";
export const HOME_CALENDAR_MINUTE_SCALE_STORAGE_KEY = "homeCalendarMinuteScale";

export function parseStoredHomeCalendarVisibleDays(rawValue: string | null): number | null {
  if (!rawValue) return null;
  const parsed = Number.parseInt(rawValue, 10);
  if (Number.isNaN(parsed)) return null;
  return clampWeekCalendarVisibleDayCount(parsed);
}

export function readHomeCalendarVisibleDaysFromStorage(): number {
  if (typeof window === "undefined") return HOME_CALENDAR_VISIBLE_DAYS_DEFAULT;
  return (
    parseStoredHomeCalendarVisibleDays(
      window.localStorage.getItem(HOME_CALENDAR_VISIBLE_DAYS_STORAGE_KEY),
    ) ?? HOME_CALENDAR_VISIBLE_DAYS_DEFAULT
  );
}

export function writeHomeCalendarVisibleDaysToStorage(count: number) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(
    HOME_CALENDAR_VISIBLE_DAYS_STORAGE_KEY,
    String(clampWeekCalendarVisibleDayCount(count)),
  );
}

export function parseStoredHomeCalendarMinuteScale(rawValue: string | null): number | null {
  if (!rawValue) return null;
  const parsed = Number.parseFloat(rawValue);
  if (Number.isNaN(parsed)) return null;
  return clampWeekCalendarMinuteScale(parsed);
}

export function readHomeCalendarMinuteScaleFromStorage(): number {
  if (typeof window === "undefined") return WEEK_CALENDAR_MINUTE_SCALE_DEFAULT;
  return (
    parseStoredHomeCalendarMinuteScale(
      window.localStorage.getItem(HOME_CALENDAR_MINUTE_SCALE_STORAGE_KEY),
    ) ?? WEEK_CALENDAR_MINUTE_SCALE_DEFAULT
  );
}

export { WEEK_CALENDAR_VISIBLE_DAY_MIN };
