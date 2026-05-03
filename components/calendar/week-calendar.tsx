import type { CalendarRepeatRule, Weekday } from "@prisma/client";
import { addDays, addMinutes, isSameDay } from "date-fns";
import { useEffect, useMemo, useRef, useState } from "react";

import { cn } from "@/lib/utils";

type Block = {
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

const PALETTE = [
  {
    soft: "border-indigo-300/70 bg-indigo-100/70 text-indigo-950 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-indigo-400",
    solid: "border-indigo-500 bg-indigo-500 text-white",
  },
  {
    soft: "border-amber-300/70 bg-amber-100/70 text-amber-950 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-amber-400",
    solid: "border-amber-400 bg-amber-400 text-white",
  },
  {
    soft: "border-rose-300/70 bg-rose-100/70 text-rose-950 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-rose-400",
    solid: "border-rose-500 bg-rose-500 text-white",
  },
  {
    soft: "border-teal-300/70 bg-teal-100/70 text-teal-950 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-teal-400",
    solid: "border-teal-500 bg-teal-500 text-white",
  },
  {
    soft: "border-violet-300/70 bg-violet-100/70 text-violet-950 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-violet-400",
    solid: "border-violet-500 bg-violet-500 text-white",
  },
  {
    soft: "border-emerald-300/70 bg-emerald-100/70 text-emerald-950 before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-emerald-400",
    solid: "border-emerald-500 bg-emerald-500 text-white",
  },
];

const STUDY_TONE = {
  soft: "border-dashed border-foreground/25 bg-muted/55 text-foreground before:absolute before:bottom-0 before:left-0 before:top-0 before:w-1 before:bg-foreground/35",
  solid: "border-foreground/80 bg-foreground text-background",
};

const MINUTE_PX = 0.72;
const VISUAL_PADDING_MINUTES = 30;
const FULL_DAY_MINUTES = 24 * 60;
const DEFAULT_VIEW_START = 8 * 60;
const DEFAULT_VIEW_END = 21 * 60;
const WEEK_HEADER_HEIGHT_PX = 36;
const TIME_AXIS_WIDTH_PX = 36;
const VISIBLE_WEEK_DAYS = 5;

function colorFor(courseId: string): number {
  let hash = 0;
  for (let i = 0; i < courseId.length; i += 1) {
    hash = (hash * 31 + courseId.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % PALETTE.length;
}

function formatTime(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

function horizontalStartIndexForDay(day?: Weekday) {
  if (!day) return 0;
  const dayIndex = DAY_ORDER.indexOf(day);
  if (dayIndex < 0) return 0;
  const maxStartIndex = Math.max(DAY_ORDER.length - VISIBLE_WEEK_DAYS, 0);
  return Math.min(Math.max(dayIndex - (VISIBLE_WEEK_DAYS - 1), 0), maxStartIndex);
}

export function WeekCalendar({
  blocks,
  anchorWeekday,
  horizontalMode = "workweek",
  nowMinute,
  showNowLine = true,
  weekStartDate,
  today,
  onCreateEvent,
  onOpenItem,
}: {
  blocks: Block[];
  anchorWeekday?: Weekday;
  horizontalMode?: "workweek" | "include-anchor";
  nowMinute?: number;
  showNowLine?: boolean;
  weekStartDate: Date;
  today?: Date;
  onCreateEvent?: (start: Date, end: Date) => void;
  onOpenItem?: (item: Block, occurrenceDate: Date) => void;
}) {
  const horizontalFrameRef = useRef<HTMLDivElement | null>(null);
  const leftAxisScrollRef = useRef<HTMLDivElement | null>(null);
  const bodyScrollRef = useRef<HTMLDivElement | null>(null);
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
  const viewportHeightPx =
    (DEFAULT_VIEW_END - DEFAULT_VIEW_START + VISUAL_PADDING_MINUTES * 2) * MINUTE_PX -
    WEEK_HEADER_HEIGHT_PX;

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
    if (bodyScrollRef.current) bodyScrollRef.current.scrollTop = scrollTop;
    if (leftAxisScrollRef.current) leftAxisScrollRef.current.scrollTop = scrollTop;
  }, [visualStartMinute, weekStartDate]);

  const blocksByDay = new Map<Weekday, Block[]>();
  for (const block of blocks) {
    const list = blocksByDay.get(block.weekday) ?? [];
    list.push(block);
    blocksByDay.set(block.weekday, list);
  }

  const dayColumnWidth = useMemo(() => Math.max(frameWidth / VISIBLE_WEEK_DAYS, 56), [frameWidth]);
  const dayTrackWidth = dayColumnWidth * visibleDays.length;
  const gridTemplateColumns = `repeat(${visibleDays.length}, minmax(${dayColumnWidth}px, ${dayColumnWidth}px))`;

  useEffect(() => {
    const node = horizontalFrameRef.current;
    if (!node || dayColumnWidth <= 0) return;
    const startIndex =
      horizontalMode === "include-anchor"
        ? horizontalStartIndexForDay(anchorWeekday)
        : 0;
    node.scrollLeft = startIndex * dayColumnWidth;
  }, [anchorWeekday, dayColumnWidth, horizontalMode, weekStartDate]);

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

  function syncVerticalScroll() {
    const body = bodyScrollRef.current;
    const axis = leftAxisScrollRef.current;
    if (!body || !axis) return;
    if (axis.scrollTop !== body.scrollTop) axis.scrollTop = body.scrollTop;
  }

  return (
    <div className="grid grid-cols-[2.25rem_minmax(0,1fr)] overflow-hidden rounded-3xl border border-border bg-card">
          <div className="w-9 shrink-0 border-r border-border/60">
            <div className="flex h-9 items-center justify-center border-b border-border/60 bg-background text-[9px] font-medium uppercase tracking-[0.08em] text-muted-foreground/80">
              Time
            </div>

            <div
              ref={leftAxisScrollRef}
              className="overflow-y-hidden"
              style={{ height: `${viewportHeightPx}px` }}
            >
              <div className="relative" style={{ height: `${fullHeightPx}px` }}>
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
                      className="absolute -translate-y-1/2 pr-1 text-right text-[10px] font-medium text-muted-foreground"
                      style={{ top: `${top}%`, right: 0, left: 0 }}
                    >
                      {m === FULL_DAY_MINUTES ? "24:00" : formatTime(m)}
                    </div>
                  );
                })}

                {showNowLine &&
                nowMinute !== undefined &&
                nowMinute >= 0 &&
                nowMinute <= FULL_DAY_MINUTES ? (
                  <div
                    className="pointer-events-none absolute left-0 right-0 z-20 -translate-y-1/2 pr-1 text-right text-[10px] font-semibold tabular-nums text-rose-500"
                    style={{ top: `${((nowMinute - visualStartMinute) / totalMinutes) * 100}%` }}
                  >
                    {formatTime(nowMinute)}
                  </div>
                ) : null}
              </div>
            </div>
          </div>

          <div className="min-w-0 bg-background">
            <div
              ref={horizontalFrameRef}
              className="overflow-x-auto overscroll-x-contain"
            >
              <div style={{ width: `${dayTrackWidth}px` }}>
                <div
                  className="grid border-b border-border/60"
                  style={{ gridTemplateColumns }}
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
                          "min-h-9 border-l border-border/60 bg-background pb-1 pt-2 text-center text-[11px] font-medium",
                          dayIndex === 0 && "border-l-0",
                          isWeekend && "bg-muted/50",
                          anchorWeekday === day ? "text-foreground" : "text-muted-foreground",
                        )}
                      >
                        <div className="inline-flex items-baseline gap-1">
                          <span>{DAY_LABEL[day]}</span>
                          <span
                            className={cn(
                              "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[10px] tabular-nums",
                              isWeekend && !isToday && "text-muted-foreground/80",
                              isToday
                                ? "bg-rose-500 text-white opacity-100"
                                : "opacity-80",
                            )}
                          >
                            {date.getDate()}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  ref={bodyScrollRef}
                  onScroll={syncVerticalScroll}
                  className="overflow-y-auto overscroll-y-contain"
                  style={{ height: `${viewportHeightPx}px` }}
                >
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
                        className="pointer-events-none absolute left-0 right-0 z-20 h-px bg-rose-500"
                        style={{
                          top: `${((nowMinute - visualStartMinute) / totalMinutes) * 100}%`,
                        }}
                      >
                        <span className="absolute -left-1 -top-[3px] h-[7px] w-[7px] rounded-full bg-rose-500" />
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
                            "relative border-l border-border/60 bg-background/40",
                            dayIndex === 0 && "border-l-0",
                            isWeekend ? "bg-muted/50" : "bg-background/40",
                            isAnchor && !isWeekend && "bg-background",
                            isAnchor && isWeekend && "bg-muted/50",
                          )}
                        >
                          <button
                            type="button"
                            aria-label={`Create event on ${DAY_LABEL[day]}`}
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

                          {hourLabels.slice(1, -1).map((m) => {
                            const top = ((m - visualStartMinute) / totalMinutes) * 100;
                            return (
                              <div
                                key={m}
                                className="absolute left-0 right-0 border-t border-border/25"
                                style={{ top: `${top}%` }}
                              />
                            );
                          })}

                          {dayBlocks.map((block, index) => {
                            const top = ((block.startMinute - visualStartMinute) / totalMinutes) * 100;
                            const height = ((block.endMinute - block.startMinute) / totalMinutes) * 100;
                            const isStudy = block.kind === "study";
                            const tone = isStudy ? STUDY_TONE : PALETTE[colorFor(block.courseId)];
                            const key = `${block.courseId}-${index}`;
                            const selected = selectedBlockKey === key;
                            const className = cn(
                              "absolute left-0.5 right-0.5 overflow-hidden rounded-[2px] border px-1.5 py-1 text-left text-[10px] leading-tight shadow-sm transition hover:brightness-95",
                              selected ? tone.solid : tone.soft,
                            );
                            const inner = (
                              <>
                                {height > 0 ? (
                                  <div className="truncate text-left opacity-80">
                                    {formatTime(block.startMinute)}
                                  </div>
                                ) : null}
                                <div className="truncate text-left font-semibold">
                                  {block.courseCode ?? block.courseName}
                                </div>
                                {height > 10 && block.location ? (
                                  <div className="truncate opacity-75">{block.location}</div>
                                ) : null}
                                {height > 13 && block.withLabel ? (
                                  <div className="truncate opacity-70">{block.withLabel}</div>
                                ) : null}
                              </>
                            );
                            const title = `${block.courseName} · ${formatTime(block.startMinute)}`;
                            const style = { top: `${top}%`, height: `${height}%` };

                            return (
                              <button
                                key={key}
                                type="button"
                                className={className}
                                style={style}
                                title={title}
                                onClick={() => {
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
                </div>
              </div>
            </div>
          </div>
    </div>
  );
}
