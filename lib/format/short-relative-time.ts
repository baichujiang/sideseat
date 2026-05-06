import { format } from "date-fns";

/**
 * Compact relative time for mobile list chrome (`31m`, `4h`, `5d`).
 * Uses floor of elapsed wall time, not calendar-day boundaries.
 */
export function formatShortRelativeTime(date: Date, base: Date = new Date()): string {
  const diffMs = base.getTime() - date.getTime();
  if (diffMs < 0) {
    return format(date, "MMM d");
  }

  const totalMinutes = Math.floor(diffMs / 60_000);
  if (totalMinutes < 1) return "<1m";
  if (totalMinutes < 60) return `${totalMinutes}m`;

  const totalHours = Math.floor(totalMinutes / 60);
  if (totalHours < 24) return `${totalHours}h`;

  const totalDays = Math.floor(totalHours / 24);
  if (totalDays < 365) return `${totalDays}d`;

  return format(date, "MMM d");
}
