/**
 * Shared “today” accent for schedule grids (week header, month cells, now-line).
 * Keep month + week views in sync when changing these tokens.
 */
export const calendarTodayChrome = {
  weekdayLabel: "font-bold text-[#E53935] dark:text-red-400",
  dayPill: "bg-[#E53935] text-white shadow-sm dark:bg-red-500",
  densityDot: "bg-[#E53935] dark:bg-red-500",
  /** iOS-style now indicator: thin baseline across the grid. */
  nowLineThin: "bg-[#E53935]/30 dark:bg-red-400/30",
  /** Bold segment + dot within today's column only. */
  nowLineBold: "bg-[#E53935] dark:bg-red-400",
  nowDot: "bg-[#E53935] dark:bg-red-400",
  nowPill: "bg-[#E53935] font-bold text-white dark:bg-red-500",
  nowMarker: "border-l-[#E53935] dark:border-l-red-400",
} as const;
