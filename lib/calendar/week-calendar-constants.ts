export const WEEK_CALENDAR_VISIBLE_DAY_MIN = 2;
export const WEEK_CALENDAR_VISIBLE_DAY_MAX = 7;
export const WEEK_CALENDAR_VISIBLE_DAYS_DEFAULT = 5;

export const WEEK_CALENDAR_MINUTE_SCALE_DEFAULT = 1;
export const WEEK_CALENDAR_MINUTE_SCALE_MIN = 0.8;
export const WEEK_CALENDAR_MINUTE_SCALE_MAX = 1.4;

export function clampWeekCalendarVisibleDayCount(value: number): number {
  if (!Number.isFinite(value)) return WEEK_CALENDAR_VISIBLE_DAYS_DEFAULT;
  return Math.max(
    WEEK_CALENDAR_VISIBLE_DAY_MIN,
    Math.min(WEEK_CALENDAR_VISIBLE_DAY_MAX, Math.round(value)),
  );
}

export function clampWeekCalendarMinuteScale(value: number): number {
  if (!Number.isFinite(value)) return WEEK_CALENDAR_MINUTE_SCALE_DEFAULT;
  const clamped = Math.max(
    WEEK_CALENDAR_MINUTE_SCALE_MIN,
    Math.min(WEEK_CALENDAR_MINUTE_SCALE_MAX, value),
  );
  return Math.round(clamped * 1000) / 1000;
}
