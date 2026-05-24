import {
  clampWeekCalendarMinuteScale,
  clampWeekCalendarVisibleDayCount,
  WEEK_CALENDAR_MINUTE_SCALE_DEFAULT,
  WEEK_CALENDAR_VISIBLE_DAYS_DEFAULT,
} from "@/lib/calendar/week-calendar-constants";

/** Tailwind `md` — phone / installed PWA stays below this width. */
export const DESKTOP_BROWSER_MIN_WIDTH_PX = 768;

/** Tailwind `lg` — sidebar + full-width shell. */
export const DESKTOP_BROWSER_WIDE_MIN_WIDTH_PX = 1024;

/** Tailwind `xl` — large landscape monitors. */
export const DESKTOP_BROWSER_XL_MIN_WIDTH_PX = 1280;

export function isDesktopBrowserViewport(
  width = typeof window !== "undefined" ? window.innerWidth : 0,
): boolean {
  return width >= DESKTOP_BROWSER_MIN_WIDTH_PX;
}

export function isWideDesktopBrowserViewport(
  width = typeof window !== "undefined" ? window.innerWidth : 0,
): boolean {
  return width >= DESKTOP_BROWSER_WIDE_MIN_WIDTH_PX;
}

/** Suggested home week-grid zoom when the user has not saved a preference yet. */
export function defaultHomeCalendarMinuteScaleForViewport(
  width = typeof window !== "undefined" ? window.innerWidth : 0,
): number {
  if (width >= DESKTOP_BROWSER_XL_MIN_WIDTH_PX) {
    return clampWeekCalendarMinuteScale(1.4);
  }
  if (width >= DESKTOP_BROWSER_WIDE_MIN_WIDTH_PX) {
    return clampWeekCalendarMinuteScale(1.32);
  }
  if (width >= DESKTOP_BROWSER_MIN_WIDTH_PX) {
    return clampWeekCalendarMinuteScale(1.16);
  }
  return WEEK_CALENDAR_MINUTE_SCALE_DEFAULT;
}

/** Show the full week on landscape desktop when no saved preference exists. */
export function defaultHomeCalendarVisibleDaysForViewport(
  width = typeof window !== "undefined" ? window.innerWidth : 0,
): number {
  if (width >= DESKTOP_BROWSER_WIDE_MIN_WIDTH_PX) {
    return clampWeekCalendarVisibleDayCount(7);
  }
  if (width >= DESKTOP_BROWSER_MIN_WIDTH_PX) {
    return clampWeekCalendarVisibleDayCount(6);
  }
  return WEEK_CALENDAR_VISIBLE_DAYS_DEFAULT;
}
