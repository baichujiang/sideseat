import type { CalendarRepeatRule, Weekday } from "@prisma/client";
import { addDays, addMinutes, isSameDay } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";

import {
  inferScheduleEventToneKey,
  SCHEDULE_EVENT_TONE_STYLES,
} from "@/lib/schedule-event-card-tone";
import {
  categoryAccentColor,
  categoryBlockSurfaceStyle,
} from "@/lib/calendar/category-visual";
import { cn } from "@/lib/utils";

export type WeekCalendarBlock = {
  courseId: string;
  courseName: string;
  courseCode: string | null;
  source: "course" | "calendar";
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  location: string | null;
  withLabel?: string | null;
  note?: string | null;
  repeatLabel?: string | null;
  repeatRule?: CalendarRepeatRule;
  repeatUntilISO?: string | null;
  eventParticipants?: Array<{ userId: string | null; name: string }>;
  kind?: "class" | "study";
  categoryId?: string | null;
  categoryName?: string | null;
  /** When set, block uses this color instead of tone heuristics. */
  categoryColor?: string | null;
};

const DAY_ORDER: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];
const DAY_LABEL: Record<Weekday, string> = {
  MON: "Mon",
  TUE: "Tue",
  WED: "Wed",
  THU: "Thu",
  FRI: "Fri",
  SAT: "Sat",
  SUN: "Sun",
};

/** Warm card chrome — outer frame + soft inner grid (not spreadsheet-heavy). */
const WEEK_CALENDAR_CARD = cn(
  "mt-4 overflow-hidden rounded-2xl border border-[#E7E0D6] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]",
  "dark:border-border dark:bg-card dark:shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
);
const WEEK_GRID_LINE = "border-[#F0ECE6] dark:border-white/[0.08]";
const WEEK_COL_DIVIDER = "border-[#F3EFE8] dark:border-white/[0.07]";

const VISUAL_PADDING_MINUTES = 30;
const FULL_DAY_MINUTES = 24 * 60;
const WEEK_HEADER_HEIGHT_PX = 32;

export type WeekCalendarDensity = "default" | "immersive";

const DENSITY_LAYOUT: Record<
  WeekCalendarDensity,
  {
    timeColumnPx: number;
    minutePx: number;
    visibleWeekDays: number;
    viewStart: number;
    viewEnd: number;
    metaLocPct: number;
    metaWithPct: number;
    axisTimeClass: string;
    blockTimeClass: string;
    blockTitleClass: string;
    metaClass: string;
  }
> = {
  default: {
    timeColumnPx: 44,
    minutePx: 0.72,
    visibleWeekDays: 5,
    viewStart: 8 * 60,
    viewEnd: 20 * 60,
    metaLocPct: 8,
    metaWithPct: 11,
    axisTimeClass: "text-[10px]",
    blockTimeClass: "text-[10px]",
    blockTitleClass: "text-[11px]",
    metaClass: "text-[9px]",
  },
  immersive: {
    timeColumnPx: 52,
    minutePx: 0.95,
    visibleWeekDays: 7,
    viewStart: 8 * 60,
    viewEnd: 20 * 60,
    metaLocPct: 5,
    metaWithPct: 7,
    axisTimeClass: "text-[11px]",
    blockTimeClass: "text-[11px]",
    blockTitleClass: "text-[12px]",
    metaClass: "text-[10px]",
  },
};

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function horizontalStartIndexForDay(day: Weekday | undefined, visibleWeekDays: number) {
  if (!day) return 0;
  const dayIndex = DAY_ORDER.indexOf(day);
  if (dayIndex < 0) return 0;
  const maxStartIndex = Math.max(DAY_ORDER.length - visibleWeekDays, 0);
  return Math.min(Math.max(dayIndex - (visibleWeekDays - 1), 0), maxStartIndex);
}

export function WeekCalendar({
  blocks,
  anchorWeekday,
  horizontalMode = "workweek",
  nowMinute,
  showNowLine = true,
  weekStartDate,
  /** Drives vertical scroll reset (e.g. same ISO week but “Today” was pressed). */
  focusDate,
  today,
  onCreateEvent,
  onOpenItem,
  density = "default",
  /** When set (e.g. fullscreen), overrides the scroll viewport height in px. */
  viewportBodyPx,
  /** Remove outer top margin — use inside a flex fill container. */
  fillParent = false,
}: {
  blocks: WeekCalendarBlock[];
  anchorWeekday?: Weekday;
  horizontalMode?: "workweek" | "include-anchor";
  nowMinute?: number;
  showNowLine?: boolean;
  weekStartDate: Date;
  focusDate: Date;
  today?: Date;
  onCreateEvent?: (start: Date, end: Date) => void;
  onOpenItem?: (item: WeekCalendarBlock, occurrenceDate: Date) => void;
  density?: WeekCalendarDensity;
  viewportBodyPx?: number;
  fillParent?: boolean;
}) {
  const cfg = DENSITY_LAYOUT[density];
  const TIME_COLUMN_PX = cfg.timeColumnPx;
  const MINUTE_PX = cfg.minutePx;
  const VISIBLE_WEEK_DAYS = cfg.visibleWeekDays;
  const DEFAULT_VIEW_START = cfg.viewStart;
  const DEFAULT_VIEW_END = cfg.viewEnd;

  const horizontalFrameRef = useRef<HTMLDivElement | null>(null);
  /** Single vertical scroll for time axis + day grid (matches day-view timeline). */
  const verticalScrollRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);

  const visibleDays = DAY_ORDER;
  const visualStartMinute = -VISUAL_PADDING_MINUTES;
  const visualEndMinute = FULL_DAY_MINUTES + VISUAL_PADDING_MINUTES;
  const totalMinutes = visualEndMinute - visualStartMinute;
  const hourLabels: number[] = [];
  for (let m = 0; m <= FULL_DAY_MINUTES; m += 60) hourLabels.push(m);

  const fullHeightPx = totalMinutes * MINUTE_PX;
  /** Visible window height — same formula as {@link ScheduleDayTimeline} (header scrolls inside content). */
  const computedViewportBodyPx =
    (DEFAULT_VIEW_END - DEFAULT_VIEW_START + VISUAL_PADDING_MINUTES * 2) * MINUTE_PX;
  const viewportHeightPx = viewportBodyPx ?? computedViewportBodyPx;

  useEffect(() => {
    const node = horizontalFrameRef.current;
    if (!node) return;

    const update = () => setFrameWidth(node.clientWidth);
    update();

    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const scrollTop =
      (DEFAULT_VIEW_START - VISUAL_PADDING_MINUTES - visualStartMinute) * MINUTE_PX;
    if (verticalScrollRef.current) verticalScrollRef.current.scrollTop = scrollTop;
  }, [visualStartMinute, weekStartDate, focusDate, DEFAULT_VIEW_START, MINUTE_PX]);

  const blocksByDay = new Map<Weekday, WeekCalendarBlock[]>();
  for (const block of blocks) {
    const list = blocksByDay.get(block.weekday) ?? [];
    list.push(block);
    blocksByDay.set(block.weekday, list);
  }

  const dayColumnWidth = useMemo(
    () => Math.max(frameWidth / VISIBLE_WEEK_DAYS, 56),
    [frameWidth, VISIBLE_WEEK_DAYS],
  );
  const dayTrackWidth = dayColumnWidth * visibleDays.length;
  const gridTemplateColumns = `repeat(${visibleDays.length}, minmax(${dayColumnWidth}px, ${dayColumnWidth}px))`;

  useEffect(() => {
    const node = horizontalFrameRef.current;
    if (!node || dayColumnWidth <= 0) return;
    const startIndex =
      horizontalMode === "include-anchor"
        ? horizontalStartIndexForDay(anchorWeekday, VISIBLE_WEEK_DAYS)
        : 0;
    node.scrollLeft = startIndex * dayColumnWidth;
  }, [anchorWeekday, dayColumnWidth, horizontalMode, weekStartDate, VISIBLE_WEEK_DAYS]);

  function clearHoldTimer() {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startMouseHold(create: () => void) {
    if (!onCreateEvent) return;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      create();
      holdTimerRef.current = null;
    }, 380);
  }

  const trackWidthPx = TIME_COLUMN_PX + dayTrackWidth;

  return (
    <div
      className={cn(
        fillParent
          ? "mt-0 flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-[#E7E0D6] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-border dark:bg-card dark:shadow-[0_8px_24px_rgba(0,0,0,0.12)]"
          : cn(WEEK_CALENDAR_CARD, "flex flex-col overflow-hidden"),
      )}
    >
      {/*
        One horizontal scroller keeps “Time + Mon…” aligned with the grid below.
        Only the block under the header scrolls vertically (time ticks + events).
      */}
      <div
        ref={horizontalFrameRef}
        className={cn(
          "min-w-0 overscroll-x-contain",
          fillParent ? "flex min-h-0 min-w-0 flex-1 flex-col overflow-x-auto" : "overflow-x-auto",
        )}
      >
        <div
          className={cn("flex flex-col", fillParent && "h-full min-h-0")}
          style={{ width: trackWidthPx }}
        >
          <div className="flex shrink-0">
            <div
              className={cn(
                "box-border flex shrink-0 cursor-default items-center justify-end border-b border-r bg-[#FAF9F6] px-0 py-0 pl-0 pr-0.5 font-semibold uppercase tracking-wide text-[#8A94A6]",
                cfg.axisTimeClass,
                WEEK_GRID_LINE,
                "dark:bg-muted/25 dark:text-muted-foreground",
              )}
              style={{
                width: TIME_COLUMN_PX,
                minWidth: TIME_COLUMN_PX,
                height: `${WEEK_HEADER_HEIGHT_PX}px`,
                minHeight: `${WEEK_HEADER_HEIGHT_PX}px`,
              }}
              onClick={() => setSelectedBlockKey(null)}
            >
              Time
            </div>
            <div
              className={cn("grid cursor-default box-border border-b bg-white dark:bg-card", WEEK_GRID_LINE)}
              style={{
                width: dayTrackWidth,
                gridTemplateColumns,
                height: `${WEEK_HEADER_HEIGHT_PX}px`,
                minHeight: `${WEEK_HEADER_HEIGHT_PX}px`,
              }}
              onClick={() => setSelectedBlockKey(null)}
            >
              {visibleDays.map((day) => {
                const dayIndex = DAY_ORDER.indexOf(day);
                const date = addDays(weekStartDate, dayIndex);
                const isToday = today ? isSameDay(date, today) : false;
                const isWeekend = day === "SAT" || day === "SUN";

                return (
                  <div
                    key={day}
                    className={cn(
                      "box-border flex h-full min-h-0 items-center justify-center overflow-hidden border-l bg-white px-0.5 py-0 text-center",
                      WEEK_COL_DIVIDER,
                      dayIndex === 0 && "border-l-0",
                      "dark:bg-card",
                      isWeekend && "bg-muted/40",
                    )}
                  >
                    <div className="flex max-h-full items-center justify-center gap-0.5">
                      <span
                        className={cn(
                          "text-[11px] font-medium tabular-nums leading-none",
                          isToday
                            ? "font-semibold text-[#111827] dark:text-foreground"
                            : cn(
                                "text-[#9CA3AF]",
                                isWeekend && !isToday && "text-[#B8C0CC]",
                                anchorWeekday === day && !isToday && "text-[#5F6B7A] dark:text-muted-foreground",
                              ),
                        )}
                      >
                        {DAY_LABEL[day]}
                      </span>
                      <span
                        className={cn(
                          "shrink-0 items-center justify-center rounded-full tabular-nums leading-none",
                          isToday
                            ? "flex h-[22px] w-[22px] text-[10px] font-bold text-white bg-[#E53935] dark:bg-red-500"
                            : cn(
                                "inline-flex h-[18px] min-w-[1.125rem] items-center justify-center px-0.5 text-[10px] font-medium text-[#9CA3AF]",
                                isWeekend && !isToday && "text-[#B8C0CC]",
                                anchorWeekday === day && !isToday && "text-[#5F6B7A] dark:text-muted-foreground",
                              ),
                        )}
                      >
                        {date.getDate()}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div
            ref={verticalScrollRef}
            className={cn(
              "min-w-0 overflow-y-auto overscroll-y-contain",
              fillParent ? "min-h-0 flex-1" : null,
            )}
            style={fillParent ? undefined : { height: `${viewportHeightPx}px` }}
          >
            <div className="flex">
              <div
                className={cn("flex shrink-0 flex-col border-r bg-[#FAF9F6]", WEEK_GRID_LINE, "dark:bg-muted/25")}
                style={{
                  width: TIME_COLUMN_PX,
                  minWidth: TIME_COLUMN_PX,
                  maxWidth: TIME_COLUMN_PX,
                }}
              >
                <div
                  className="relative cursor-default bg-[#FAF9F6] dark:bg-muted/25"
                  style={{ height: `${fullHeightPx}px` }}
                  onClick={() => setSelectedBlockKey(null)}
                >
                  {hourLabels.map((m) => {
                    const hiddenByNow =
                      showNowLine &&
                      nowMinute !== undefined &&
                      nowMinute >= 0 &&
                      nowMinute <= FULL_DAY_MINUTES &&
                      Math.abs(m - nowMinute) < 28;
                    if (hiddenByNow) return null;
                    const top = ((m - visualStartMinute) / totalMinutes) * 100;
                    return (
                      <div
                        key={m}
                        className="pointer-events-none absolute inset-x-0 -translate-y-1/2 pl-0 pr-0.5 text-right tabular-nums"
                        style={{ top: `${top}%` }}
                      >
                        <span
                          className={cn(
                            "font-medium tabular-nums leading-none text-[#5F6B7A] dark:text-muted-foreground",
                            cfg.axisTimeClass,
                          )}
                        >
                          {m === FULL_DAY_MINUTES ? "24:00" : formatTime(m)}
                        </span>
                      </div>
                    );
                  })}

                  {showNowLine &&
                  nowMinute !== undefined &&
                  nowMinute >= 0 &&
                  nowMinute <= FULL_DAY_MINUTES ? (
                    <div
                      className="pointer-events-none absolute inset-x-0 z-20 -translate-y-1/2 pl-0 pr-0.5 text-right tabular-nums"
                      style={{ top: `${((nowMinute - visualStartMinute) / totalMinutes) * 100}%` }}
                    >
                      <span
                        className={cn(
                          "inline-block rounded-full bg-[#E53935] px-1.5 py-0.5 font-semibold tabular-nums leading-none text-white shadow-sm dark:bg-red-500",
                          cfg.axisTimeClass,
                        )}
                      >
                        {formatTime(nowMinute)}
                      </span>
                    </div>
                  ) : null}
                </div>
                <div className="h-24 shrink-0 bg-[#FAF9F6] dark:bg-muted/25" aria-hidden />
              </div>

              <div className="min-w-0 bg-white dark:bg-card" style={{ width: dayTrackWidth }}>
                <div
                  className="relative grid"
                  style={{
                    gridTemplateColumns,
                    height: `${fullHeightPx}px`,
                  }}
                >
                    {showNowLine &&
                    nowMinute !== undefined &&
                    nowMinute >= 0 &&
                    nowMinute <= FULL_DAY_MINUTES ? (
                      <div
                        className="pointer-events-none absolute inset-x-0 z-20"
                        style={{
                          top: `${((nowMinute - visualStartMinute) / totalMinutes) * 100}%`,
                        }}
                      >
                        <div className="relative h-0 w-full -translate-y-1/2">
                          <span
                            className="absolute left-0 top-1/2 -translate-y-1/2 border-y-[4px] border-y-transparent border-l-[6px] border-l-[#E53935] dark:border-l-red-400"
                            aria-hidden
                          />
                          <div className="absolute left-2 right-0 top-1/2 h-px -translate-y-1/2 bg-[#E53935]/90 dark:bg-red-400/90" />
                        </div>
                      </div>
                    ) : null}

                    {visibleDays.map((day) => {
                      const dayBlocks = blocksByDay.get(day) ?? [];
                      const isAnchor = anchorWeekday === day;
                      const isWeekend = day === "SAT" || day === "SUN";
                      const dayIndex = DAY_ORDER.indexOf(day);

                      const createFromPointer = (clientY: number, rect: DOMRect) => {
                        if (!onCreateEvent) return;
                        const y = clientY - rect.top;
                        const rawMinute = visualStartMinute + (y / rect.height) * totalMinutes;
                        const snappedMinute = Math.max(
                          0,
                          Math.min(FULL_DAY_MINUTES - 60, Math.round(rawMinute / 60) * 60),
                        );
                        const start = new Date(weekStartDate);
                        start.setDate(weekStartDate.getDate() + dayIndex);
                        start.setHours(0, snappedMinute, 0, 0);
                        const end = addMinutes(start, 60);
                        onCreateEvent?.(start, end);
                      };

                      return (
                        <div
                          key={day}
                          className={cn(
                            "relative border-l bg-white/90",
                            WEEK_COL_DIVIDER,
                            dayIndex === 0 && "border-l-0",
                            isWeekend ? "bg-[#FAF8F5] dark:bg-muted/50" : "bg-white/90 dark:bg-card/80",
                            isAnchor && !isWeekend && "bg-white dark:bg-card",
                            isAnchor && isWeekend && "bg-[#FAF8F5] dark:bg-muted/50",
                          )}
                        >
                          <button
                            type="button"
                            aria-label={`Create event on ${DAY_LABEL[day]}`}
                            onClick={() => setSelectedBlockKey(null)}
                            onDoubleClick={(event) => {
                              createFromPointer(
                                event.clientY,
                                event.currentTarget.getBoundingClientRect(),
                              );
                            }}
                            onTouchStart={(event) => {
                              if (!onCreateEvent) return;
                              const touch = event.touches[0];
                              const rect = event.currentTarget.getBoundingClientRect();
                              clearHoldTimer();
                              holdTimerRef.current = window.setTimeout(() => {
                                createFromPointer(touch.clientY, rect);
                                holdTimerRef.current = null;
                              }, 380);
                            }}
                            onTouchMove={clearHoldTimer}
                            onTouchEnd={clearHoldTimer}
                            onTouchCancel={clearHoldTimer}
                            onMouseDown={(event) => {
                              const rect = event.currentTarget.getBoundingClientRect();
                              startMouseHold(() => createFromPointer(event.clientY, rect));
                            }}
                            onMouseUp={clearHoldTimer}
                            onMouseLeave={clearHoldTimer}
                            className="absolute inset-0 z-0 cursor-default"
                          />

                          {hourLabels.map((m) => {
                            const top = ((m - visualStartMinute) / totalMinutes) * 100;
                            return (
                              <div
                                key={m}
                                className={cn(
                                  "pointer-events-none absolute left-0 right-0 border-t",
                                  WEEK_GRID_LINE,
                                )}
                                style={{ top: `${top}%` }}
                              />
                            );
                          })}

                          {dayBlocks.map((block, index) => {
                            const top = ((block.startMinute - visualStartMinute) / totalMinutes) * 100;
                            const height = ((block.endMinute - block.startMinute) / totalMinutes) * 100;
                            const isStudy = block.kind === "study";
                            const labelText = [block.courseCode, block.courseName]
                              .filter(Boolean)
                              .join(" ")
                              .trim();
                            const inferTitle = labelText || block.courseName || block.courseId;
                            const toneKey = inferScheduleEventToneKey({
                              kind: isStudy ? "study" : "class",
                              title: inferTitle,
                            });
                            const tone = SCHEDULE_EVENT_TONE_STYLES[toneKey];
                            const isDraftNewTone = toneKey === "draftNew";
                            const key = `${block.courseId}-${index}`;
                            const selected = selectedBlockKey === key;
                            const catHex = block.categoryColor?.trim();
                            const useCategoryColor = Boolean(catHex);
                            const className = cn(
                              "absolute inset-x-0 z-[1] overflow-hidden rounded-2xl px-1.5 py-1 text-left leading-tight transition hover:brightness-[0.98] active:brightness-95",
                              !useCategoryColor && (selected ? tone.cardSelected : tone.card),
                              useCategoryColor && "shadow-sm",
                            );
                            const metaCls = cn(
                              "truncate leading-tight",
                              cfg.metaClass,
                              useCategoryColor
                                ? selected
                                  ? "text-white/85"
                                  : "text-[#111827]/65 dark:text-muted-foreground"
                                : selected && !isDraftNewTone
                                  ? "text-white/80"
                                  : "text-[#111827]/65 dark:text-muted-foreground",
                            );
                            const titleLine = labelText || block.courseName || "Event";
                            const inner = (
                              <>
                                {height > 0 ? (
                                  <p
                                    className={cn(
                                      "truncate text-left tabular-nums font-medium leading-none",
                                      cfg.blockTimeClass,
                                      !useCategoryColor && (selected ? tone.accentColorSelected : tone.accentColor),
                                    )}
                                    style={
                                      useCategoryColor && catHex
                                        ? { color: selected ? "#ffffff" : categoryAccentColor(catHex) }
                                        : undefined
                                    }
                                  >
                                    {formatTime(block.startMinute)}
                                  </p>
                                ) : null}
                                <p
                                  className={cn(
                                    "mt-px truncate text-left font-semibold leading-snug",
                                    cfg.blockTitleClass,
                                    !useCategoryColor && (selected ? tone.titleSelected : tone.title),
                                    useCategoryColor &&
                                      (selected ? "text-white" : "text-[#111827] dark:text-foreground"),
                                  )}
                                >
                                  {titleLine}
                                </p>
                                {height > cfg.metaLocPct && block.location ? (
                                  <p className={cn("mt-px", metaCls)}>{block.location}</p>
                                ) : null}
                                {height > cfg.metaWithPct && block.withLabel ? (
                                  <p className={cn("mt-px", metaCls)}>{block.withLabel}</p>
                                ) : null}
                              </>
                            );
                            const title = `${block.courseName} · ${formatTime(block.startMinute)}`;
                            const positionStyle = { top: `${top}%`, height: `${height}%` };
                            const surfaceStyle =
                              useCategoryColor && catHex
                                ? { ...positionStyle, ...categoryBlockSurfaceStyle(catHex, selected) }
                                : positionStyle;

                            return (
                              <button
                                key={key}
                                type="button"
                                className={className}
                                style={surfaceStyle}
                                title={title}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (block.courseId === "__draft-preview__") return;
                                  setSelectedBlockKey(key);
                                  const occurrenceDate = addDays(weekStartDate, dayIndex);
                                  onOpenItem?.(block, occurrenceDate);
                                }}
                              >
                                <div className="flex h-full flex-col items-start justify-start">{inner}</div>
                              </button>
                            );
                          })}
                        </div>
                      );
                    })}
                </div>
                <div className="h-24 shrink-0" aria-hidden />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
