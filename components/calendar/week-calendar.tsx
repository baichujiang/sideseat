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
import { computeEventOverlapLayout } from "@/lib/calendar/event-overlap-layout";
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
  /** Stable id for PATCH when `source === "calendar"` (user-created events). */
  calendarEntryId?: string | null;
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
const LONG_PRESS_MS = 450;
const POINTER_SLOP_PX = 14;
const SNAP_MINUTES = 15;
const MIN_EVENT_MINUTES = 15;

/** Nested calendar drags — only clear body `user-select` when outermost ends. */
let calendarDragSelectLockDepth = 0;
function lockBrowserTextSelectionForCalendarDrag() {
  if (calendarDragSelectLockDepth === 0) {
    document.body.style.userSelect = "none";
    document.documentElement.style.userSelect = "none";
  }
  calendarDragSelectLockDepth += 1;
}
function unlockBrowserTextSelectionForCalendarDrag() {
  if (calendarDragSelectLockDepth <= 0) return;
  calendarDragSelectLockDepth -= 1;
  if (calendarDragSelectLockDepth === 0) {
    document.body.style.userSelect = "";
    document.documentElement.style.userSelect = "";
  }
}

function snapMinute(m: number): number {
  const s = Math.round(m / SNAP_MINUTES) * SNAP_MINUTES;
  return Math.max(0, Math.min(FULL_DAY_MINUTES - 1, s));
}

export type WeekCalendarDensity = "default" | "immersive";

const DENSITY_LAYOUT: Record<
  WeekCalendarDensity,
  {
    timeColumnPx: number;
    minutePx: number;
    bottomSpacerPx: number;
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
    bottomSpacerPx: 96,
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
    minutePx: 0.84,
    bottomSpacerPx: 48,
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
  onPatchCalendarEventTimes,
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
  /** Long-press drag / resize calendar events (PATCH start/end only). */
  onPatchCalendarEventTimes?: (args: { eventId: string; startAt: Date; endAt: Date }) => Promise<boolean>;
  density?: WeekCalendarDensity;
  viewportBodyPx?: number;
  fillParent?: boolean;
}) {
  const cfg = DENSITY_LAYOUT[density];
  const TIME_COLUMN_PX = cfg.timeColumnPx;
  const MINUTE_PX = cfg.minutePx;
  const BOTTOM_SPACER_PX = cfg.bottomSpacerPx;
  const VISIBLE_WEEK_DAYS = cfg.visibleWeekDays;
  const DEFAULT_VIEW_START = cfg.viewStart;
  const DEFAULT_VIEW_END = cfg.viewEnd;

  const horizontalFrameRef = useRef<HTMLDivElement | null>(null);
  /** Single vertical scroll for time axis + day grid (matches day-view timeline). */
  const verticalScrollRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const [selectedBlockKey, setSelectedBlockKey] = useState<string | null>(null);
  const [dragOverride, setDragOverride] = useState<{
    eventId: string;
    weekday: Weekday;
    startMinute: number;
    endMinute: number;
  } | null>(null);
  const dayBodyElRef = useRef<Map<Weekday, HTMLDivElement | null>>(new Map());
  const suppressOpenClickRef = useRef(false);
  /** After PATCH success, keep `dragOverride` until `blocks` reflect new times (avoids one frame of old position). */
  const pendingDragClearRef = useRef<{
    eventId: string;
    weekday: Weekday;
    startMinute: number;
    endMinute: number;
  } | null>(null);
  const dragClearFallbackTimerRef = useRef<number | null>(null);

  function clearDragClearFallbackTimer() {
    if (dragClearFallbackTimerRef.current !== null) {
      window.clearTimeout(dragClearFallbackTimerRef.current);
      dragClearFallbackTimerRef.current = null;
    }
  }

  function scheduleDragClearFallback() {
    clearDragClearFallbackTimer();
    dragClearFallbackTimerRef.current = window.setTimeout(() => {
      dragClearFallbackTimerRef.current = null;
      pendingDragClearRef.current = null;
      setDragOverride(null);
    }, 5000);
  }

  const effectiveBlocks = useMemo(() => {
    if (!dragOverride) return blocks;
    return blocks.map((b) => {
      if (b.calendarEntryId && b.calendarEntryId === dragOverride.eventId) {
        return {
          ...b,
          weekday: dragOverride.weekday,
          startMinute: dragOverride.startMinute,
          endMinute: dragOverride.endMinute,
        };
      }
      return b;
    });
  }, [blocks, dragOverride]);

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

  useEffect(() => {
    const pending = pendingDragClearRef.current;
    if (!pending) return;
    const found = blocks.some(
      (b) =>
        b.calendarEntryId === pending.eventId &&
        b.weekday === pending.weekday &&
        Math.round(b.startMinute) === Math.round(pending.startMinute) &&
        Math.round(b.endMinute) === Math.round(pending.endMinute),
    );
    if (found) {
      pendingDragClearRef.current = null;
      clearDragClearFallbackTimer();
      setDragOverride(null);
    }
  }, [blocks]);

  useEffect(() => () => clearDragClearFallbackTimer(), []);

  useEffect(
    () => () => {
      if (calendarDragSelectLockDepth > 0) {
        calendarDragSelectLockDepth = 0;
        document.body.style.userSelect = "";
        document.documentElement.style.userSelect = "";
      }
    },
    [],
  );

  const blocksByDay = new Map<Weekday, WeekCalendarBlock[]>();
  for (const block of effectiveBlocks) {
    const list = blocksByDay.get(block.weekday) ?? [];
    list.push(block);
    blocksByDay.set(block.weekday, list);
  }
  const positionedBlocksByDay = new Map(
    DAY_ORDER.map((day) => {
      const dayBlocks = blocksByDay.get(day) ?? [];
      return [
        day,
        computeEventOverlapLayout(
          dayBlocks.map((block, index) => ({
            ...block,
            id: block.calendarEntryId
              ? `cal-${block.calendarEntryId}`
              : `${block.courseId}-${block.startMinute}-${block.endMinute}-${index}`,
          })),
        ),
      ] as const;
    }),
  );

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

  function weekdayFromClientXY(clientX: number, clientY: number): Weekday | null {
    for (const d of DAY_ORDER) {
      const el = dayBodyElRef.current.get(d);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return d;
      }
    }
    return null;
  }

  /** Sub-minute precision — use while dragging; snap only on release / commit. */
  function rawMinuteFromClientYForDay(clientY: number, weekday: Weekday): number {
    const el = dayBodyElRef.current.get(weekday);
    if (!el) return 12 * 60;
    const r = el.getBoundingClientRect();
    if (r.height <= 1) return 0;
    const frac = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    const raw = visualStartMinute + frac * totalMinutes;
    return Math.max(0, Math.min(FULL_DAY_MINUTES, raw));
  }

  function buildStartEndAt(weekday: Weekday, startMinute: number, endMinute: number): { startAt: Date; endAt: Date } {
    const idx = DAY_ORDER.indexOf(weekday);
    const base = addDays(weekStartDate, idx);
    const dayStart = new Date(base.getFullYear(), base.getMonth(), base.getDate());
    const sm = Math.max(0, Math.min(FULL_DAY_MINUTES - 1, startMinute));
    const em = Math.max(sm + MIN_EVENT_MINUTES, Math.min(FULL_DAY_MINUTES, endMinute));
    const startAt = addMinutes(dayStart, sm);
    let endAt = addMinutes(dayStart, em);
    if (endAt <= startAt) {
      endAt = addMinutes(startAt, MIN_EVENT_MINUTES);
    }
    return { startAt, endAt };
  }

  function startCalendarPointerSession(
    e: React.PointerEvent,
    block: WeekCalendarBlock,
    mode: "move" | "resize-start" | "resize-end",
    fromWeekday: Weekday,
  ) {
    if (!onPatchCalendarEventTimes || !block.calendarEntryId) return;
    if (block.courseId === "__draft-preview__") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    e.preventDefault();

    if (dragOverride && dragOverride.eventId !== block.calendarEntryId) {
      pendingDragClearRef.current = null;
      clearDragClearFallbackTimer();
      setDragOverride(null);
    }

    const eventId = block.calendarEntryId;
    const pointerId = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const captureEl = e.currentTarget as HTMLElement;

    let curWeekday: Weekday = fromWeekday;
    let curStart = block.startMinute;
    let curEnd = block.endMinute;
    const originDuration = Math.max(MIN_EVENT_MINUTES, block.endMinute - block.startMinute);
    const grabOffsetMove =
      mode === "move" ? rawMinuteFromClientYForDay(e.clientY, fromWeekday) - block.startMinute : 0;

    /** Top/bottom length handles: drag immediately. Body still uses long-press to move. */
    const immediateActivate = mode === "resize-start" || mode === "resize-end";

    let activatedForDrag = immediateActivate;
    let longPressTimer: number | null = null;

    if (immediateActivate) {
      lockBrowserTextSelectionForCalendarDrag();
      window.getSelection()?.removeAllRanges();
      try {
        captureEl.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      setDragOverride({
        eventId,
        weekday: curWeekday,
        startMinute: curStart,
        endMinute: curEnd,
      });
    } else {
      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        activatedForDrag = true;
        lockBrowserTextSelectionForCalendarDrag();
        window.getSelection()?.removeAllRanges();
        try {
          captureEl.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        setDragOverride({
          eventId,
          weekday: curWeekday,
          startMinute: curStart,
          endMinute: curEnd,
        });
      }, LONG_PRESS_MS);
    }

    const clearLongPress = () => {
      if (longPressTimer != null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const detach = () => {
      document.removeEventListener("pointermove", onDocMove);
      document.removeEventListener("pointerup", onDocUp);
      document.removeEventListener("pointercancel", onDocUp);
      unlockBrowserTextSelectionForCalendarDrag();
    };

    const onDocMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!activatedForDrag) {
        if (
          longPressTimer != null &&
          Math.hypot(ev.clientX - x0, ev.clientY - y0) > POINTER_SLOP_PX
        ) {
          clearLongPress();
          detach();
        }
        return;
      }
      const hit = weekdayFromClientXY(ev.clientX, ev.clientY);
      if (hit) curWeekday = hit;
      const m = rawMinuteFromClientYForDay(ev.clientY, curWeekday);
      if (mode === "move") {
        let ns = m - grabOffsetMove;
        ns = Math.max(0, Math.min(FULL_DAY_MINUTES - originDuration, ns));
        curStart = ns;
        curEnd = ns + originDuration;
      } else if (mode === "resize-start") {
        let ns = m;
        ns = Math.min(ns, curEnd - MIN_EVENT_MINUTES);
        ns = Math.max(0, ns);
        curStart = ns;
      } else {
        let ne = m;
        ne = Math.max(ne, curStart + MIN_EVENT_MINUTES);
        ne = Math.min(FULL_DAY_MINUTES, ne);
        curEnd = ne;
      }
      setDragOverride({ eventId, weekday: curWeekday, startMinute: curStart, endMinute: curEnd });
    };

    const onDocUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      clearLongPress();
      detach();
      if (!activatedForDrag) return;
      try {
        captureEl.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      let snapStart = curStart;
      let snapEnd = curEnd;
      if (mode === "move") {
        let ns = snapMinute(curStart);
        ns = Math.max(0, Math.min(FULL_DAY_MINUTES - originDuration, ns));
        snapStart = ns;
        snapEnd = ns + originDuration;
      } else if (mode === "resize-start") {
        let ns = snapMinute(curStart);
        ns = Math.min(ns, curEnd - MIN_EVENT_MINUTES);
        ns = Math.max(0, ns);
        snapStart = ns;
        snapEnd = curEnd;
      } else {
        let ne = snapMinute(curEnd);
        ne = Math.max(ne, curStart + MIN_EVENT_MINUTES);
        ne = Math.min(FULL_DAY_MINUTES, ne);
        snapEnd = ne;
        snapStart = curStart;
      }
      setDragOverride({
        eventId,
        weekday: curWeekday,
        startMinute: snapStart,
        endMinute: snapEnd,
      });

      void (async () => {
        const patch = onPatchCalendarEventTimes;
        const { startAt, endAt } = buildStartEndAt(curWeekday, snapStart, snapEnd);
        if (patch && endAt > startAt) {
          const ok = await patch({ eventId, startAt, endAt });
          if (!ok) {
            pendingDragClearRef.current = null;
            clearDragClearFallbackTimer();
            setDragOverride(null);
            return;
          }
          pendingDragClearRef.current = {
            eventId,
            weekday: curWeekday,
            startMinute: snapStart,
            endMinute: snapEnd,
          };
          scheduleDragClearFallback();
        } else {
          pendingDragClearRef.current = null;
          clearDragClearFallbackTimer();
          setDragOverride(null);
        }
        suppressOpenClickRef.current = true;
        window.setTimeout(() => {
          suppressOpenClickRef.current = false;
        }, 280);
      })();
    };

    document.addEventListener("pointermove", onDocMove);
    document.addEventListener("pointerup", onDocUp);
    document.addEventListener("pointercancel", onDocUp);
  }

  return (
    <div
      className={cn(
        "select-none [-webkit-touch-callout:none]",
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
                <div className="shrink-0 bg-[#FAF9F6] dark:bg-muted/25" style={{ height: `${BOTTOM_SPACER_PX}px` }} aria-hidden />
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
                      const dayBlocks = positionedBlocksByDay.get(day) ?? [];
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
                          ref={(node) => {
                            dayBodyElRef.current.set(day, node);
                          }}
                          data-weekday={day}
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
                            const effectiveHeight = Math.max(height, Math.min(4, height));
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
                            const key = block.id;
                            const selected = selectedBlockKey === key;
                            const draggingThis = Boolean(
                              dragOverride?.eventId && block.calendarEntryId === dragOverride.eventId,
                            );
                            const highlighted = selected || draggingThis;
                            const catHex = block.categoryColor?.trim();
                            const useCategoryColor = Boolean(catHex);
                            const startMinuteShown = draggingThis
                              ? snapMinute(block.startMinute)
                              : block.startMinute;
                            const className = cn(
                              "absolute z-[1] overflow-hidden rounded-2xl px-1.5 py-1 text-left leading-tight transition hover:brightness-[0.98] active:brightness-95",
                              draggingThis && "!transition-none",
                              !useCategoryColor && (highlighted ? tone.cardSelected : tone.card),
                              useCategoryColor && "shadow-sm",
                              block.hasShortOverlap && !highlighted && "shadow-[0_12px_28px_-18px_rgba(15,23,42,0.45)]",
                              draggingThis &&
                                "z-[80] scale-[1.02] shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)] ring-2 ring-[#E53935]/55 ring-offset-2 ring-offset-white dark:ring-red-400/50 dark:ring-offset-card",
                            );
                            const metaCls = cn(
                              "truncate leading-tight",
                              cfg.metaClass,
                              useCategoryColor
                                ? highlighted
                                  ? "text-white/85"
                                  : "text-[#111827]/65 dark:text-muted-foreground"
                                : highlighted && !isDraftNewTone
                                  ? "text-white/80"
                                  : "text-[#111827]/65 dark:text-muted-foreground",
                            );
                            const titleLine = labelText || block.courseName || "Event";
                            const inner = (
                              <>
                                {effectiveHeight > 0 ? (
                                  <p
                                    className={cn(
                                      "truncate text-left tabular-nums font-medium leading-none",
                                      cfg.blockTimeClass,
                                      !useCategoryColor &&
                                        (highlighted ? tone.accentColorSelected : tone.accentColor),
                                    )}
                                    style={
                                      useCategoryColor && catHex
                                        ? { color: highlighted ? "#ffffff" : categoryAccentColor(catHex) }
                                        : undefined
                                    }
                                  >
                                    {formatTime(startMinuteShown)}
                                  </p>
                                ) : null}
                                <p
                                  className={cn(
                                    "mt-px truncate text-left font-semibold leading-snug",
                                    cfg.blockTitleClass,
                                    !useCategoryColor && (highlighted ? tone.titleSelected : tone.title),
                                    useCategoryColor &&
                                      (highlighted ? "text-white" : "text-[#111827] dark:text-foreground"),
                                  )}
                                >
                                  {titleLine}
                                </p>
                                {effectiveHeight > cfg.metaLocPct && block.location ? (
                                  <p className={cn("mt-px", metaCls)}>{block.location}</p>
                                ) : null}
                                {effectiveHeight > cfg.metaWithPct && block.withLabel ? (
                                  <p className={cn("mt-px", metaCls)}>{block.withLabel}</p>
                                ) : null}
                              </>
                            );
                            const title = `${block.courseName} · ${formatTime(startMinuteShown)}`;
                            const columnWidth = 100 / Math.max(block.columnCount, 1);
                            const horizontalGapPct = block.columnCount > 1 ? 0.8 : 0;
                            const widthPct = Math.max(8, columnWidth - horizontalGapPct);
                            const stackInsetPx = block.hasShortOverlap ? Math.min(block.stackDepth * 8, 18) : 0;
                            const positionStyle = {
                              top: `${top}%`,
                              height: `${effectiveHeight}%`,
                              left: `calc(${block.columnIndex * columnWidth}% + ${stackInsetPx}px)`,
                              width: `calc(${widthPct}% - ${stackInsetPx}px)`,
                              zIndex: draggingThis
                                ? 80
                                : selected
                                  ? 4
                                  : block.columnIndex * 10 + block.stackDepth + 1,
                            };
                            const surfaceStyle =
                              useCategoryColor && catHex
                                ? { ...positionStyle, ...categoryBlockSurfaceStyle(catHex, highlighted) }
                                : positionStyle;

                            const isDraggableCalendar =
                              Boolean(onPatchCalendarEventTimes) &&
                              block.source === "calendar" &&
                              Boolean(block.calendarEntryId) &&
                              block.courseId !== "__draft-preview__";

                            if (isDraggableCalendar) {
                              return (
                                <div
                                  key={key}
                                  className={cn(
                                    className,
                                    "flex min-h-0 touch-none select-none flex-col",
                                  )}
                                  style={surfaceStyle}
                                  title={title}
                                  role="group"
                                >
                                  <button
                                    type="button"
                                    className={cn(
                                      "relative z-40 mx-auto flex h-7 w-9 shrink-0 cursor-ns-resize touch-none items-center justify-center rounded-full border-0 bg-transparent p-0 outline-none ring-offset-2 ring-offset-white hover:bg-black/[0.06] focus-visible:ring-2 focus-visible:ring-[#E53935]/60 dark:hover:bg-white/[0.08] dark:ring-offset-card",
                                    )}
                                    aria-label={`Drag anchor to change start time: ${titleLine}`}
                                    onPointerDown={(ev) => {
                                      ev.stopPropagation();
                                      startCalendarPointerSession(ev, block, "resize-start", day);
                                    }}
                                  >
                                    <span
                                      className="pointer-events-none block h-2.5 w-2.5 rounded-full border-2 border-[#E53935] bg-white shadow-[0_1px_4px_rgba(15,23,42,0.2)] dark:border-red-400 dark:bg-card"
                                      aria-hidden
                                    />
                                  </button>
                                  <div
                                    role="button"
                                    tabIndex={0}
                                    className={cn(
                                      "relative z-20 min-h-0 flex-1 cursor-grab overflow-hidden active:cursor-grabbing",
                                      draggingThis && "cursor-grabbing",
                                    )}
                                    onKeyDown={(ev) => {
                                      if (ev.key === "Enter" || ev.key === " ") {
                                        ev.preventDefault();
                                        setSelectedBlockKey(key);
                                        onOpenItem?.(block, addDays(weekStartDate, dayIndex));
                                      }
                                    }}
                                    onClick={(ev) => {
                                      ev.stopPropagation();
                                      if (suppressOpenClickRef.current) return;
                                      setSelectedBlockKey(key);
                                      onOpenItem?.(block, addDays(weekStartDate, dayIndex));
                                    }}
                                    onPointerDown={(ev) => {
                                      ev.stopPropagation();
                                      startCalendarPointerSession(ev, block, "move", day);
                                    }}
                                  >
                                    <div className="pointer-events-none flex min-h-0 flex-1 flex-col items-start justify-start overflow-hidden">
                                      {inner}
                                    </div>
                                  </div>
                                  <button
                                    type="button"
                                    className={cn(
                                      "relative z-40 mx-auto flex h-7 w-9 shrink-0 cursor-ns-resize touch-none items-center justify-center rounded-full border-0 bg-transparent p-0 outline-none ring-offset-2 ring-offset-white hover:bg-black/[0.06] focus-visible:ring-2 focus-visible:ring-[#E53935]/60 dark:hover:bg-white/[0.08] dark:ring-offset-card",
                                    )}
                                    aria-label={`Drag anchor to change end time: ${titleLine}`}
                                    onPointerDown={(ev) => {
                                      ev.stopPropagation();
                                      startCalendarPointerSession(ev, block, "resize-end", day);
                                    }}
                                  >
                                    <span
                                      className="pointer-events-none block h-2.5 w-2.5 rounded-full border-2 border-[#E53935] bg-white shadow-[0_1px_4px_rgba(15,23,42,0.2)] dark:border-red-400 dark:bg-card"
                                      aria-hidden
                                    />
                                  </button>
                                </div>
                              );
                            }

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
                <div className="shrink-0" style={{ height: `${BOTTOM_SPACER_PX}px` }} aria-hidden />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
