import type { WeekCalendarDayColumn } from "@/lib/calendar/week-calendar-day-columns";
import { cn } from "@/lib/utils";

export type ShareSelectionChrome = {
  runStart: boolean;
  runEnd: boolean;
  suppressLeftDivider: boolean;
};

export type ShareSelectionRun = {
  startIndex: number;
  count: number;
};

export type ShareSelectionZone = "header" | "middle" | "body";

/** Tokens aligned with Home date nav + classmates-blue chips. */
export const shareSelectionChromeTokens = {
  weekdayLabelSelected: "font-semibold text-foreground dark:text-foreground",
  dayPillSelected:
    "bg-classmates-blue-soft font-bold text-classmates-blue shadow-[inset_0_0_0_1px_rgba(37,99,235,0.28)] dark:bg-blue-950/55 dark:text-blue-200",
  weekdayLabelUnselected: "font-medium text-muted-foreground/65",
  dayPillUnselected: "font-medium text-muted-foreground/60",
  columnUnselected: "opacity-[0.58] saturate-[0.82]",
  columnSelected: "opacity-100 saturate-100",
  headerCellSelected: "bg-white dark:bg-card",
  headerCellUnselected: "bg-muted/18 dark:bg-muted/15",
  focusRing: "focus-visible:ring-2 focus-visible:ring-classmates-blue-border/80 dark:focus-visible:ring-blue-500/45",
} as const;

export function shareSelectionWeekdayLabelClass(args: {
  selectMode: boolean;
  isToday: boolean;
  isShareSelected: boolean;
  isWeekend: boolean;
  isAnchor: boolean;
  todayClass: string;
}): string {
  const { selectMode, isToday, isShareSelected, isWeekend, isAnchor, todayClass } = args;
  if (selectMode) {
    if (isToday) return isShareSelected ? todayClass : "font-bold text-[#E53935]/55 dark:text-red-400/50";
    return isShareSelected
      ? shareSelectionChromeTokens.weekdayLabelSelected
      : shareSelectionChromeTokens.weekdayLabelUnselected;
  }
  if (isToday) return todayClass;
  return cn(
    "font-medium text-[#9CA3AF]",
    isWeekend && !isToday && "text-[#B8C0CC]",
    isAnchor && !isToday && "font-semibold text-[#5F6B7A] dark:text-muted-foreground",
  );
}

export function shareSelectionDayPillClass(args: {
  selectMode: boolean;
  isToday: boolean;
  isShareSelected: boolean;
  isWeekend: boolean;
  isAnchor: boolean;
  todayClass: string;
}): string {
  const { selectMode, isToday, isShareSelected, isWeekend, isAnchor, todayClass } = args;
  if (selectMode) {
    if (isToday) return isShareSelected ? todayClass : "font-semibold text-muted-foreground/55";
    return isShareSelected
      ? shareSelectionChromeTokens.dayPillSelected
      : shareSelectionChromeTokens.dayPillUnselected;
  }
  if (isToday) return todayClass;
  return cn(
    "font-medium text-[#6B7280]",
    isWeekend && !isToday && "text-[#9CA3AF]",
    isAnchor && !isToday && "font-semibold text-[#374151] dark:text-foreground",
  );
}

export function shareSelectionColumnToneClass(
  selectMode: boolean,
  isShareSelected: boolean,
): string {
  if (!selectMode) return "";
  return isShareSelected
    ? shareSelectionChromeTokens.columnSelected
    : shareSelectionChromeTokens.columnUnselected;
}

/** @deprecated Use shareSelectionColumnToneClass */
export function shareSelectionColumnMutedClass(
  selectMode: boolean,
  isShareSelected: boolean,
): string {
  return shareSelectionColumnToneClass(selectMode, isShareSelected);
}

export function shareSelectionHeaderCellClass(
  selectMode: boolean,
  isShareSelected: boolean,
): string {
  if (!selectMode) return "";
  return isShareSelected
    ? shareSelectionChromeTokens.headerCellSelected
    : shareSelectionChromeTokens.headerCellUnselected;
}

/** Diagonal hatch for days outside the shared set (recipient view). */
export const shareRecipientExcludedHatchClass =
  "bg-[repeating-linear-gradient(-45deg,rgba(148,163,184,0.22)_0px,rgba(148,163,184,0.22)_6px,transparent_6px,transparent_12px)] dark:bg-[repeating-linear-gradient(-45deg,rgba(71,85,105,0.45)_0px,rgba(71,85,105,0.45)_6px,transparent_6px,transparent_12px)]";

/** Recipient share link: days not in `highlightedDateKeys` (no blue owner-selection chrome). */
export function shareRecipientDimColumnClass(dimMode: boolean, isShareSelected: boolean): string {
  if (!dimMode || isShareSelected) return "";
  return cn(
    "grayscale-[0.35] contrast-[0.9]",
    "bg-neutral-300/45 dark:bg-neutral-800/55",
    "shadow-[inset_0_0_0_1px_rgba(100,116,139,0.22)]",
    shareRecipientExcludedHatchClass,
  );
}

export function shareRecipientDimHeaderCellClass(dimMode: boolean, isShareSelected: boolean): string {
  if (!dimMode || isShareSelected) return "";
  return cn(
    "bg-neutral-300/80 dark:bg-neutral-800/75",
    "shadow-[inset_0_0_0_1px_rgba(100,116,139,0.28)]",
    shareRecipientExcludedHatchClass,
  );
}

export function shareRecipientDimWeekdayLabelClass(args: {
  isShareSelected: boolean;
  isToday: boolean;
  todayClass: string;
}): string {
  const { isShareSelected, isToday, todayClass } = args;
  if (isShareSelected) {
    return isToday ? todayClass : "font-semibold text-foreground";
  }
  return isToday
    ? "font-bold text-[#E53935]/45 dark:text-red-400/40 line-through decoration-red-400/35"
    : "font-semibold text-neutral-500 dark:text-neutral-400 line-through decoration-neutral-400/70";
}

export function shareRecipientDimDayPillClass(args: {
  isShareSelected: boolean;
  isToday: boolean;
  todayClass: string;
}): string {
  const { isShareSelected, isToday, todayClass } = args;
  if (isShareSelected) {
    return isToday ? todayClass : "font-bold text-foreground";
  }
  return cn(
    "border border-dashed border-neutral-400/70 bg-neutral-200/90 font-semibold text-neutral-500",
    "dark:border-neutral-500/80 dark:bg-neutral-800/90 dark:text-neutral-400",
    isToday && "line-through decoration-neutral-400/60",
  );
}

export function shareRecipientExcludedBodyOverlayClass(): string {
  return cn(
    "pointer-events-none absolute inset-0 z-[4]",
    shareRecipientExcludedHatchClass,
    "opacity-80",
  );
}

export function buildShareSelectionChromeByDateKey(
  dayColumns: readonly WeekCalendarDayColumn[],
  highlightedDateKeys?: ReadonlySet<string>,
): Map<string, ShareSelectionChrome> {
  const map = new Map<string, ShareSelectionChrome>();
  if (!highlightedDateKeys?.size) return map;

  dayColumns.forEach((column, columnIndex) => {
    if (!highlightedDateKeys.has(column.dateKey)) return;
    const prevSelected =
      columnIndex > 0 && highlightedDateKeys.has(dayColumns[columnIndex - 1]!.dateKey);
    const nextSelected =
      columnIndex < dayColumns.length - 1 &&
      highlightedDateKeys.has(dayColumns[columnIndex + 1]!.dateKey);
    map.set(column.dateKey, {
      runStart: !prevSelected,
      runEnd: !nextSelected,
      suppressLeftDivider: prevSelected,
    });
  });

  return map;
}

/** Contiguous horizontal runs of selected share days (for unified border overlays). */
export function buildShareSelectionRuns(
  dayColumns: readonly WeekCalendarDayColumn[],
  highlightedDateKeys?: ReadonlySet<string>,
): ShareSelectionRun[] {
  const runs: ShareSelectionRun[] = [];
  if (!highlightedDateKeys?.size) return runs;

  let runStart: number | null = null;
  dayColumns.forEach((column, columnIndex) => {
    if (!highlightedDateKeys.has(column.dateKey)) {
      if (runStart !== null) {
        runs.push({ startIndex: runStart, count: columnIndex - runStart });
        runStart = null;
      }
      return;
    }
    if (runStart === null) runStart = columnIndex;
  });
  if (runStart !== null) {
    runs.push({ startIndex: runStart, count: dayColumns.length - runStart });
  }
  return runs;
}

/** One overlay per contiguous run — fill + stroke span header / all-day / body bands. */
export function shareSelectionRunOverlayClass(zone: ShareSelectionZone): string {
  return cn(
    "pointer-events-none z-20 box-border min-h-0",
    "border-2 border-classmates-blue bg-classmates-blue-soft/12",
    "dark:border-blue-500 dark:bg-blue-950/18",
    zone === "header" && "rounded-t-[10px] border-b-0",
    zone === "middle" && "border-y-0",
    zone === "body" && "rounded-b-[10px] border-t-0",
  );
}

/** Absolute layer inset: extend 1px past padding so borders cover parent `border-b` grid lines. */
export function shareSelectionRunOverlayLayerInsetClass(zone: ShareSelectionZone): string {
  switch (zone) {
    case "header":
      return "left-0 right-0 top-0 -bottom-px";
    case "middle":
      return "left-0 right-0 -top-px -bottom-px";
    case "body":
      return "left-0 right-0 -top-px bottom-0";
  }
}

/** Hide internal column dividers inside a selected run (overlay draws the outer box). */
export function shareSelectionColumnDividerClass(
  chrome: ShareSelectionChrome | undefined,
): string {
  if (!chrome) return "";
  return cn(chrome.suppressLeftDivider && "border-l-transparent");
}
