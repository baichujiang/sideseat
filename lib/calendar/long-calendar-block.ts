/** Minutes within one civil day (wall-clock), used with Berlin-derived start/end. */
const MINUTES_PER_DAY = 24 * 60;

/**
 * Very long single-day calendar blocks (e.g. all-day style). Day/list views label these “All day”.
 */
export function isLongOrAllDayTimedMinutes(startMinute: number, endMinute: number): boolean {
  if (endMinute <= startMinute) return false;
  const dur = endMinute - startMinute;
  if (dur >= 21 * 60) return true;
  if (startMinute <= 3 * 60 && endMinute >= 22 * 60 + 45) return true;
  return dur >= MINUTES_PER_DAY - 120;
}
