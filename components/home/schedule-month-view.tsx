"use client";

import {
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";

import { cn } from "@/lib/utils";

/**
 * Month grid. Designed as a **navigator**, not an agenda: each cell shows the
 * day number and a density dot, and tapping any cell tells the parent to
 * anchor the Day view on that date. This is why we don't try to render
 * event titles inside the cells — on a 7-wide grid on mobile there simply
 * isn't room, and count-only cells don't justify their space.
 *
 * `getDensityForDate(date)` must be a pure, cheap lookup (we call it for ~42
 * cells on every render); the parent should memoize its derivation of event
 * counts from the raw blocks + calendar entries.
 */
export function ScheduleMonthView({
  anchorDate,
  selectedDate,
  today,
  getDensityForDate,
  onSelectDate,
}: {
  /** Any date within the displayed month. */
  anchorDate: Date;
  selectedDate: Date;
  today: Date;
  /** Returns number of events on `date` (classes + study sessions combined). */
  getDensityForDate: (date: Date) => number;
  /** Fired when a user taps a cell; parent updates selection (e.g. shows that day below). */
  onSelectDate: (date: Date) => void;
}) {
  const monthStart = startOfMonth(anchorDate);
  const monthEnd = endOfMonth(anchorDate);

  // Monday-start week; extend to full weeks so the grid is a clean 6x7.
  const gridStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const gridEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd });

  return (
    <div
      className={cn(
        "mt-2 overflow-hidden rounded-2xl border border-[#E7E0D6] bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)]",
        "dark:border-border dark:bg-card dark:shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
      )}
    >
      <div className="grid grid-cols-7 text-center text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="py-1">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((date) => {
          const inMonth = isSameMonth(date, anchorDate);
          const isToday = isSameDay(date, today);
          const isSelected = isSameDay(date, selectedDate);
          const isWeekend = date.getDay() === 0 || date.getDay() === 6;
          const density = getDensityForDate(date);
          const baseCellBg = isWeekend ? "bg-[#FAF8F5] dark:bg-muted/35" : "bg-white";
          const cellState = isToday
            ? "border-[#F0ECE6] text-foreground dark:border-white/12"
            : isSelected
              ? "border-[#E7E0D6] text-foreground ring-1 ring-[#E7E0D6]/50 dark:border-border dark:ring-border/40"
              : "border-[#F0ECE6] text-foreground hover:bg-[#FAFAF8] dark:border-white/12 dark:hover:bg-muted/15";

          return (
            <button
              key={date.toISOString()}
              type="button"
              onClick={() => onSelectDate(date)}
              aria-pressed={isSelected}
              aria-label={`${date.toDateString()} — ${density} ${density === 1 ? "event" : "events"}`}
              className={cn(
                "flex aspect-square flex-col items-center justify-center rounded-xl border text-[13px] transition",
                baseCellBg,
                cellState,
                !inMonth && !isSelected && !isToday ? "opacity-40" : undefined,
              )}
            >
              <span
                className={cn(
                  "font-semibold tabular-nums leading-none",
                  isToday &&
                    "inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-[#2563EB] px-1.5 text-sm font-bold text-white dark:bg-[#2563EB]",
                )}
              >
                {date.getDate()}
              </span>
              <DensityDots
                count={density}
                tone={isToday ? "primary" : isSelected ? "inverse" : "default"}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Tiny 1–3 dot indicator. Anything over 3 just shows three dots — we only
 * need "none / light / medium / busy" resolution in a month overview.
 */
function DensityDots({
  count,
  tone,
}: {
  count: number;
  tone: "default" | "primary" | "inverse";
}) {
  if (count <= 0) {
    return <span className="mt-1 h-1 w-1" aria-hidden />;
  }
  const dotCount = Math.min(count, 3);
  const color =
    tone === "inverse"
      ? "bg-background/70"
      : tone === "primary"
        ? "bg-[#2563EB]"
        : "bg-foreground/50";
  return (
    <span className="mt-1 flex gap-0.5" aria-hidden>
      {Array.from({ length: dotCount }).map((_, i) => (
        <span key={i} className={cn("h-1 w-1 rounded-full", color)} />
      ))}
    </span>
  );
}
