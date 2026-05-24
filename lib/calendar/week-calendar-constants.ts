export const WEEK_CALENDAR_VISIBLE_DAY_MIN = 2;
export const WEEK_CALENDAR_VISIBLE_DAY_MAX = 7;
export const WEEK_CALENDAR_VISIBLE_DAYS_DEFAULT = 5;

/** Initial half-width around `focusDate` in continuous virtual scroll (total ≈ 29 columns). */
export const WEEK_CALENDAR_VIRTUAL_INITIAL_BUFFER_DAYS = 14;
/** Days prepended/appended when scrolling near a strip edge. */
export const WEEK_CALENDAR_VIRTUAL_EXTEND_CHUNK_DAYS = 14;
/** Extend when within this many day-columns of an edge. */
export const WEEK_CALENDAR_VIRTUAL_EXTEND_THRESHOLD_DAYS = 7;
/** Sliding window cap after extending. */
export const WEEK_CALENDAR_VIRTUAL_MAX_COLUMNS = 50;

/** Matches Home client schedule fetch window (scroll clamp + background load). */
export const HOME_CALENDAR_DATA_WINDOW_PAST_DAYS = 90;
export const HOME_CALENDAR_DATA_WINDOW_FUTURE_DAYS = 180;

/** @deprecated Use `WEEK_CALENDAR_VIRTUAL_INITIAL_BUFFER_DAYS`. */
export const WEEK_CALENDAR_CONTINUOUS_BUFFER_DAYS = WEEK_CALENDAR_VIRTUAL_INITIAL_BUFFER_DAYS;

export const WEEK_CALENDAR_MINUTE_SCALE_DEFAULT = 1;
export const WEEK_CALENDAR_MINUTE_SCALE_MIN = 0.8;
export const WEEK_CALENDAR_MINUTE_SCALE_MAX = 1.65;

/** Minimum day-column width when the viewport can still fit every visible column. */
export const WEEK_CALENDAR_DAY_COLUMN_MIN_PX = 56;

export function fitWeekCalendarDayColumnWidth(
  dayStripViewportPx: number,
  visibleWeekDays: number,
): number {
  const visible = clampWeekCalendarVisibleDayCount(visibleWeekDays);
  const strip = Math.max(dayStripViewportPx, 1);
  const exactShare = strip / visible;
  const minReadable = WEEK_CALENDAR_DAY_COLUMN_MIN_PX;
  if (exactShare >= minReadable) return exactShare;
  if (minReadable * visible <= strip) return minReadable;
  return Math.max(1, strip / visible);
}

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
