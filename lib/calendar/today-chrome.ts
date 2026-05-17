/**
 * Shared “today” accent for schedule grids (week header, month cells, now-line).
 * Keep month + week views in sync when changing these tokens.
 */
export const calendarTodayChrome = {
  weekdayLabel: "font-bold text-[#E53935] dark:text-red-400",
  dayPill: "bg-[#E53935] text-white shadow-sm dark:bg-red-500",
  densityDot: "bg-[#E53935] dark:bg-red-500",
  nowLine: "bg-[#E53935]/90 dark:bg-red-400/90",
  nowMarker: "border-l-[#E53935] dark:border-l-red-400",
} as const;
