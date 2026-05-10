import type { CalendarRepeatRule, Weekday } from "@prisma/client";
import { addDays, addMinutes, isSameDay } from "date-fns";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  SCHEDULE_EVENT_TONE_STYLES,
  scheduleShortOverlapRailClass,
  scheduleVisualToneKey,
} from "@/lib/schedule-event-card-tone";
import {
  categoryAccentColor,
  categoryBlockSurfaceStyle,
} from "@/lib/calendar/category-visual";
import {
  computeEventOverlapLayout,
  SCHEDULE_SHORT_OVERLAP_GLASS,
} from "@/lib/calendar/event-overlap-layout";
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

/**
 * Week grid stacking (low → high). Prevents events / drag shadows from painting over sticky rails or headers.
 *
 * - Sticky week header band sits above all day-body content (vertical scroll).
 * - Left time rails sit above events in the day grid (horizontal scroll) but below the header band.
 * - All event z-index values stay below `Z_TIME_RAIL_BODY` so they cannot cover the rails.
 */
const Z_DAY_CREATE_HIT = 0;
const Z_DAY_HOUR_LINES = 1;
const Z_DAY_NOW_LINE_SPAN = 2;
const Z_EVENT_CARD_BASE = 3;
const Z_EVENT_CARD_SELECTED = 8;
/** Dragging + resize — must stay < Z_TIME_RAIL_BODY. */
const Z_EVENT_CARD_DRAGGING = 35;
const Z_EVENT_DRAG_INNER = 20;
const Z_EVENT_RESIZE_HANDLE = 38;
const Z_DAY_HEADER_CELL = 10;
const Z_WEEK_HEADER_STICKY = 50;
/** "Time" corner only — above day-of-week headers in the same sticky row when panning horizontally. */
const Z_TIME_RAIL_HEADER = 55;
/** Main + all-day left rails — above every card in the scrollable grid. */
const Z_TIME_RAIL_BODY = 45;
/** Now pill / tick inside the left rail only (below rail chrome). */
const Z_TIME_AXIS_INNER = 1;

const LONG_PRESS_MS = 450;
const POINTER_SLOP_PX = 14;
const SNAP_MINUTES = 15;
const MIN_EVENT_MINUTES = 15;
/** After this many px of movement, lock 2D scroll to horizontal OR vertical for the rest of the gesture. */
const AXIS_LOCK_THRESHOLD_PX = 14;

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
    minutePx: 0.59,
    bottomSpacerPx: 28,
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
  /** Full-day rows (holidays, etc.) — shown above the timed grid so they are not clipped above 08:00. */
  allDayBlocks = [],
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
  allDayBlocks?: WeekCalendarBlock[];
  anchorWeekday?: Weekday;
  horizontalMode?: "workweek" | "include-anchor";
  nowMinute?: number;
  showNowLine?: boolean;
  weekStartDate: Date;
  focusDate: Date;
  today?: Date;
  onCreateEvent?: (start: Date, end: Date) => void;
  /** Long-press (~450ms): calendar → edit flow from parent; course → detail. Tap selects only. */
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

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
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

  /** Dominant-axis lock for the week grid’s 2D `overflow-auto` scroller (touch / pen / mouse drag). */
  const scrollAxisGestureRef = useRef<{ pointerId: number; x0: number; y0: number } | null>(null);
  const [scrollAxisLock, setScrollAxisLock] = useState<"free" | "h" | "v">("free");

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

  // Measure before paint so the first hydrated frame does not use the 56px
  // fallback column width (narrow grid → wide grid flash).
  useLayoutEffect(() => {
    const node = scrollContainerRef.current;
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
    if (scrollContainerRef.current) scrollContainerRef.current.scrollTop = scrollTop;
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

  useEffect(() => {
    const end = (e: PointerEvent) => {
      const g = scrollAxisGestureRef.current;
      if (g && e.pointerId === g.pointerId) {
        scrollAxisGestureRef.current = null;
        setScrollAxisLock("free");
      }
    };
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
    return () => {
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
    };
  }, []);

  const onScrollAxisPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!e.isPrimary) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    scrollAxisGestureRef.current = {
      pointerId: e.pointerId,
      x0: e.clientX,
      y0: e.clientY,
    };
    setScrollAxisLock("free");
  }, []);

  const onScrollAxisPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const g = scrollAxisGestureRef.current;
    if (!g || e.pointerId !== g.pointerId) return;
    setScrollAxisLock((lock) => {
      if (lock !== "free") return lock;
      const dx = e.clientX - g.x0;
      const dy = e.clientY - g.y0;
      const th = AXIS_LOCK_THRESHOLD_PX;
      if (dx * dx + dy * dy < th * th) return lock;
      return Math.abs(dx) > Math.abs(dy) ? "h" : "v";
    });
  }, []);

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

  /** Width available for day columns in the scrollport (sticky time axis is not part of the day strip). */
  const dayStripViewportPx = Math.max(frameWidth - TIME_COLUMN_PX, 1);
  const dayColumnWidth = useMemo(
    () => Math.max(dayStripViewportPx / VISIBLE_WEEK_DAYS, 56),
    [dayStripViewportPx, VISIBLE_WEEK_DAYS],
  );
  const dayTrackWidth = dayColumnWidth * visibleDays.length;
  const gridTemplateColumns = `repeat(${visibleDays.length}, minmax(${dayColumnWidth}px, ${dayColumnWidth}px))`;

  useLayoutEffect(() => {
    const node = scrollContainerRef.current;
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

  function attachTapSelectLongOpen(
    e: React.PointerEvent,
    block: WeekCalendarBlock,
    occurrenceDate: Date,
    blockKey: string,
  ) {
    if (block.courseId === "__draft-preview__") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    const pointerId = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    let longPressFired = false;
    let timer: number | null = window.setTimeout(() => {
      timer = null;
      if (!onOpenItem) return;
      longPressFired = true;
      suppressOpenClickRef.current = true;
      window.setTimeout(() => {
        suppressOpenClickRef.current = false;
      }, 300);
      onOpenItem(block, occurrenceDate);
    }, LONG_PRESS_MS);

    const clearTimer = () => {
      if (timer != null) {
        window.clearTimeout(timer);
        timer = null;
      }
    };

    const detach = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > POINTER_SLOP_PX) {
        clearTimer();
        detach();
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      clearTimer();
      detach();
      if (!longPressFired) {
        setSelectedBlockKey(blockKey);
      }
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onUp);
  }

  function startCalendarPointerSession(
    e: React.PointerEvent,
    block: WeekCalendarBlock,
    mode: "move" | "resize-start" | "resize-end",
    fromWeekday: Weekday,
    occurrenceDate: Date,
    blockInteractionKey: string,
    moveFromSelected: boolean,
  ) {
    if (!onPatchCalendarEventTimes || !block.calendarEntryId) return;
    if (block.courseId === "__draft-preview__") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const immediateActivate = mode === "resize-start" || mode === "resize-end";

    if (immediateActivate) {
      e.preventDefault();
    }

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

    let activatedForDrag = immediateActivate;
    let longPressTimer: number | null = null;
    let longPressOpened = false;
    let didMove = false;

    const preventScroll = (ev: TouchEvent) => {
      ev.preventDefault();
    };

    if (immediateActivate) {
      lockBrowserTextSelectionForCalendarDrag();
      window.getSelection()?.removeAllRanges();
      try {
        captureEl.setPointerCapture(pointerId);
      } catch {
        /* ignore */
      }
      document.addEventListener("touchmove", preventScroll, { passive: false });
      setDragOverride({
        eventId,
        weekday: curWeekday,
        startMinute: curStart,
        endMinute: curEnd,
      });
    } else if (mode === "move" && moveFromSelected) {
      /* Drag starts after pointer slop once the card is already selected. */
    } else if (mode === "move" && onOpenItem) {
      longPressTimer = window.setTimeout(() => {
        longPressTimer = null;
        longPressOpened = true;
        suppressOpenClickRef.current = true;
        window.setTimeout(() => {
          suppressOpenClickRef.current = false;
        }, 300);
        onOpenItem(block, occurrenceDate);
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
      document.removeEventListener("touchmove", preventScroll);
      unlockBrowserTextSelectionForCalendarDrag();
    };

    const onDocMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!activatedForDrag) {
        const pastSlop = Math.hypot(ev.clientX - x0, ev.clientY - y0) > POINTER_SLOP_PX;
        if (mode === "move" && moveFromSelected && pastSlop) {
          activatedForDrag = true;
          didMove = true;
          lockBrowserTextSelectionForCalendarDrag();
          window.getSelection()?.removeAllRanges();
          try {
            captureEl.setPointerCapture(pointerId);
          } catch {
            /* ignore */
          }
          document.addEventListener("touchmove", preventScroll, { passive: false });
          setDragOverride({
            eventId,
            weekday: curWeekday,
            startMinute: curStart,
            endMinute: curEnd,
          });
          return;
        }
        if (longPressTimer != null && pastSlop) {
          clearLongPress();
          detach();
        }
        return;
      }
      if (!didMove && Math.hypot(ev.clientX - x0, ev.clientY - y0) > POINTER_SLOP_PX) {
        didMove = true;
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

      if (!activatedForDrag) {
        if (mode === "move" && !moveFromSelected && !longPressOpened) {
          setSelectedBlockKey(blockInteractionKey);
        }
        return;
      }

      if (!didMove && mode === "move") {
        setDragOverride(null);
        suppressOpenClickRef.current = true;
        window.setTimeout(() => {
          suppressOpenClickRef.current = false;
        }, 300);
        return;
      }
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

      suppressOpenClickRef.current = true;
      window.setTimeout(() => {
        suppressOpenClickRef.current = false;
      }, 300);

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
        ref={scrollContainerRef}
        className={cn(
          "min-w-0 overflow-auto overscroll-contain",
          fillParent ? "min-h-0 min-w-0 flex-1" : null,
          scrollAxisLock === "h" && "touch-pan-x",
          scrollAxisLock === "v" && "touch-pan-y",
        )}
        style={fillParent ? undefined : { height: `${WEEK_HEADER_HEIGHT_PX + viewportHeightPx}px` }}
        onPointerDown={onScrollAxisPointerDown}
        onPointerMove={onScrollAxisPointerMove}
      >
        <div style={{ width: trackWidthPx }}>
          <div
            className="sticky top-0 flex shrink-0"
            style={{ zIndex: Z_WEEK_HEADER_STICKY }}
          >
            <div
              className={cn(
                "sticky left-0 box-border flex shrink-0 cursor-default items-center justify-end border-b border-r bg-[#FAF9F6] px-0 py-0 pl-0 pr-0.5 font-semibold uppercase tracking-wide text-[#8A94A6]",
                cfg.axisTimeClass,
                WEEK_GRID_LINE,
                "dark:bg-muted/25 dark:text-muted-foreground",
              )}
              style={{
                zIndex: Z_TIME_RAIL_HEADER,
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
              className={cn("relative grid cursor-default box-border border-b bg-white dark:bg-card", WEEK_GRID_LINE)}
              style={{
                zIndex: Z_DAY_HEADER_CELL,
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
                            ? "font-semibold text-[#E53935] dark:text-red-500"
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
                          "inline-flex h-[18px] min-w-[1.125rem] shrink-0 items-center justify-center px-0.5 text-[10px] font-medium tabular-nums leading-none",
                          isToday
                            ? "font-semibold text-[#E53935] dark:text-red-500"
                            : cn(
                                "text-[#9CA3AF]",
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

          {allDayBlocks.length > 0 ? (
            <div className="flex shrink-0 border-b border-[#F0ECE6] bg-[#FAFAF8] dark:border-white/[0.08] dark:bg-muted/25">
              <div
                className={cn(
                  "sticky left-0 box-border flex shrink-0 items-start justify-end border-r bg-[#FAFAF8] px-1 py-2 pt-2.5 text-right",
                  WEEK_GRID_LINE,
                  "dark:bg-muted/25",
                )}
                style={{
                  zIndex: Z_TIME_RAIL_BODY,
                  width: TIME_COLUMN_PX,
                  minWidth: TIME_COLUMN_PX,
                  maxWidth: TIME_COLUMN_PX,
                }}
              >
                <span
                  className={cn(
                    "max-w-[2.75rem] font-medium leading-tight text-[#8A94A6] dark:text-muted-foreground",
                    cfg.axisTimeClass,
                  )}
                >
                  All day
                </span>
              </div>
              <div
                className="grid min-w-0 bg-white dark:bg-card"
                style={{ width: dayTrackWidth, gridTemplateColumns }}
              >
                {visibleDays.map((day) => {
                  const dayIndex = DAY_ORDER.indexOf(day);
                  const occurrenceDate = addDays(weekStartDate, dayIndex);
                  const isWeekend = day === "SAT" || day === "SUN";
                  const dayBlocks = allDayBlocks.filter((b) => b.weekday === day);
                  return (
                    <div
                      key={`allday-${day}`}
                      className={cn(
                        "box-border flex min-h-[2.25rem] flex-col gap-1 border-l px-1 py-1",
                        WEEK_COL_DIVIDER,
                        dayIndex === 0 && "border-l-0",
                        isWeekend && "bg-[#FAF8F5] dark:bg-muted/35",
                      )}
                    >
                      {dayBlocks.map((block, bi) => {
                        const labelText = [block.courseCode, block.courseName]
                          .filter(Boolean)
                          .join(" ")
                          .trim();
                        const inferTitle = labelText || block.courseName || block.courseId;
                        const toneKey = scheduleVisualToneKey({
                          source: block.source,
                          kind: block.kind === "study" ? "study" : "class",
                          title: inferTitle,
                        });
                        const tone = SCHEDULE_EVENT_TONE_STYLES[toneKey];
                        const catHex = block.categoryColor?.trim();
                        const useCategory = block.source === "calendar" && Boolean(catHex);
                        const alldayKey = `allday:${day}:${bi}:${block.calendarEntryId ?? block.courseId}`;
                        const alldaySelected = selectedBlockKey === alldayKey;
                        const alldayExpanded = alldaySelected;
                        const alldayTitleLine =
                          block.source === "course" && block.courseCode?.trim()
                            ? block.courseName
                            : labelText || block.courseName;
                        const alldayMetaCls = cn(
                          "break-words text-[10px] font-normal leading-snug",
                          useCategory
                            ? "text-white/85"
                            : alldaySelected && toneKey !== "draftNew"
                              ? "text-white/80"
                              : "text-[#111827]/70 dark:text-zinc-400",
                        );
                        return (
                          <div
                            key={`${block.calendarEntryId ?? block.courseId}-allday-${bi}`}
                            className={cn("relative w-full", alldaySelected && "z-[2]")}
                          >
                            <button
                              type="button"
                              onPointerDown={(e) => attachTapSelectLongOpen(e, block, occurrenceDate, alldayKey)}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  onOpenItem?.(block, occurrenceDate);
                                }
                              }}
                              className={cn(
                                "relative z-[1] w-full rounded-sm p-0 text-left text-[10px] font-semibold leading-tight transition",
                                "hover:brightness-[0.98] active:brightness-95",
                                alldayExpanded
                                  ? "ring-2 ring-[#2563EB]/35 ring-offset-1 ring-offset-white dark:ring-blue-400/40 dark:ring-offset-card"
                                  : "truncate overflow-hidden",
                                !useCategory && (alldaySelected ? tone.cardSelected : tone.card),
                                useCategory && "border border-black/10 shadow-sm dark:border-white/10",
                              )}
                              style={
                                useCategory && catHex
                                  ? categoryBlockSurfaceStyle(catHex, alldaySelected)
                                  : undefined
                              }
                            >
                              <span
                                className={cn(
                                  "flex min-w-0 flex-row rounded-[inherit]",
                                  !alldayExpanded && "overflow-hidden",
                                )}
                              >
                                <span
                                  aria-hidden
                                  className={cn(
                                    "w-1 shrink-0 self-stretch rounded-l-sm",
                                    !useCategory && (alldaySelected ? tone.railSelected : tone.rail),
                                    useCategory && catHex && "bg-transparent",
                                  )}
                                  style={
                                    useCategory && catHex
                                      ? { backgroundColor: categoryAccentColor(catHex) }
                                      : undefined
                                  }
                                />
                                <span className="flex min-w-0 flex-1 flex-col gap-px px-1.5 py-1">
                                  {alldayExpanded ? (
                                    <>
                                      <span className={alldayMetaCls}>All day</span>
                                      {block.source === "course" && block.courseCode?.trim() ? (
                                        <>
                                          <span className="break-words font-bold tabular-nums leading-snug text-classmates-blue dark:text-blue-200">
                                            {block.courseCode.trim()}
                                          </span>
                                          <span
                                            className={cn(
                                              "break-words font-semibold leading-snug",
                                              !useCategory && tone.titleSelected,
                                              useCategory && "text-white",
                                            )}
                                          >
                                            {block.courseName}
                                          </span>
                                        </>
                                      ) : (
                                        <span
                                          className={cn(
                                            "break-words font-semibold leading-snug",
                                            !useCategory && tone.titleSelected,
                                            useCategory && "text-white",
                                          )}
                                        >
                                          {alldayTitleLine}
                                        </span>
                                      )}
                                      {block.repeatLabel?.trim() ? (
                                        <span className={cn("mt-0.5", alldayMetaCls)}>
                                          {block.repeatLabel.trim()}
                                        </span>
                                      ) : null}
                                      {block.location?.trim() ? (
                                        <span className={cn("mt-0.5", alldayMetaCls)}>
                                          {block.location.trim()}
                                        </span>
                                      ) : null}
                                      {block.withLabel?.trim() ? (
                                        <span className={cn("mt-0.5", alldayMetaCls)}>
                                          {block.withLabel.trim()}
                                        </span>
                                      ) : null}
                                      {block.note?.trim() ? (
                                        <span className={cn("mt-0.5", alldayMetaCls)}>{block.note.trim()}</span>
                                      ) : null}
                                    </>
                                  ) : block.source === "course" && block.courseCode?.trim() ? (
                                    <>
                                      <span className="truncate font-bold tabular-nums leading-tight text-classmates-blue dark:text-blue-200">
                                        {block.courseCode.trim()}
                                      </span>
                                      <span className="min-w-0 truncate font-semibold leading-snug text-[#111827] dark:text-foreground">
                                        {block.courseName}
                                      </span>
                                    </>
                                  ) : (
                                    <span className="min-w-0 truncate leading-snug">
                                      {labelText || block.courseName}
                                    </span>
                                  )}
                                </span>
                              </span>
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="relative z-0 flex">
              <div
                className={cn(
                  "sticky left-0 flex shrink-0 flex-col border-r bg-[#FAF9F6]",
                  WEEK_GRID_LINE,
                  "dark:bg-muted/25",
                )}
                style={{
                  zIndex: Z_TIME_RAIL_BODY,
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
                      className="pointer-events-none absolute inset-x-0"
                      style={{
                        zIndex: Z_TIME_AXIS_INNER,
                        top: `${((nowMinute - visualStartMinute) / totalMinutes) * 100}%`,
                      }}
                    >
                      <span
                        className={cn(
                          "absolute right-0 top-0 inline-block -translate-y-1/2 rounded-full bg-[#E53935] px-1.5 py-px font-semibold tabular-nums leading-none text-white dark:bg-red-500",
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

              <div
                className="relative isolate z-0 min-w-0 bg-white dark:bg-card"
                style={{ width: dayTrackWidth }}
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
                        className="pointer-events-none absolute inset-x-0"
                        style={{
                          zIndex: Z_DAY_NOW_LINE_SPAN,
                          top: `${((nowMinute - visualStartMinute) / totalMinutes) * 100}%`,
                        }}
                      >
                        <div className="absolute inset-x-0 top-0 h-px -translate-y-1/2 bg-[#E53935]/90 dark:bg-red-400/90" />
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
                            className="absolute inset-0 cursor-default"
                            style={{ zIndex: Z_DAY_CREATE_HIT }}
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
                            const toneKey = scheduleVisualToneKey({
                              source: block.source,
                              kind: isStudy ? "study" : "class",
                              title: inferTitle,
                            });
                            const tone = SCHEDULE_EVENT_TONE_STYLES[toneKey];
                            const isDraftNewTone = toneKey === "draftNew";
                            const key = block.id;
                            const occurrenceDate = addDays(weekStartDate, dayIndex);
                            const selected = selectedBlockKey === key;
                            const draggingThis = Boolean(
                              dragOverride?.eventId && block.calendarEntryId === dragOverride.eventId,
                            );
                            const highlighted = selected || draggingThis;
                            const expandedCard = selected && !draggingThis;
                            const shortOverlapGlass = Boolean(block.hasShortOverlap && !highlighted);
                            const catHex = block.categoryColor?.trim();
                            const useCategoryColor = block.source === "calendar" && Boolean(catHex);
                            const startMinuteShown = draggingThis
                              ? snapMinute(block.startMinute)
                              : block.startMinute;
                            const endMinuteShown = draggingThis
                              ? snapMinute(block.endMinute)
                              : block.endMinute;
                            const className = cn(
                              "absolute rounded-sm p-0 text-left leading-tight transition hover:brightness-[0.98] active:brightness-95",
                              "overflow-hidden",
                              draggingThis && "!transition-none",
                              !useCategoryColor &&
                                (highlighted
                                  ? tone.cardSelected
                                  : shortOverlapGlass
                                    ? SCHEDULE_SHORT_OVERLAP_GLASS
                                    : tone.card),
                              useCategoryColor &&
                                (shortOverlapGlass
                                  ? "shadow-[0_8px_22px_-10px_rgba(15,23,42,0.2)] dark:shadow-[0_8px_26px_-12px_rgba(0,0,0,0.55)]"
                                  : "shadow-sm"),
                              draggingThis &&
                                "scale-[1.02] shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)] ring-2 ring-[#E53935]/55 ring-offset-2 ring-offset-white dark:ring-red-400/50 dark:ring-offset-card",
                            );
                            const metaCls = cn(
                              "leading-tight",
                              !highlighted && "truncate",
                              cfg.metaClass,
                              useCategoryColor
                                ? highlighted
                                  ? "text-white/85"
                                  : "text-[#111827]/65 dark:text-muted-foreground"
                                : highlighted && !isDraftNewTone
                                  ? "text-white/80"
                                  : "text-[#111827]/65 dark:text-muted-foreground",
                            );
                            const expandedDetailCls = cn(
                              "break-words text-[11px] font-normal leading-snug",
                              useCategoryColor
                                ? "text-white/85"
                                : !isDraftNewTone
                                  ? "text-white/80"
                                  : "text-[#374151] dark:text-zinc-400",
                            );
                            const titleLine =
                              block.source === "course" && block.courseCode?.trim()
                                ? block.courseName
                                : labelText || block.courseName || "Event";
                            const showLocation =
                              Boolean(block.location) && !highlighted && effectiveHeight > cfg.metaLocPct;
                            const showWith =
                              Boolean(block.withLabel) && !highlighted && effectiveHeight > cfg.metaWithPct;
                            const innerNormal = (
                              <>
                                {effectiveHeight > 0 ? (
                                  <p
                                    className={cn(
                                      "truncate text-left tabular-nums font-medium leading-none",
                                      cfg.blockTimeClass,
                                      !useCategoryColor && tone.accentColor,
                                    )}
                                    style={
                                      useCategoryColor && catHex
                                        ? { color: categoryAccentColor(catHex) }
                                        : undefined
                                    }
                                  >
                                    {formatTime(startMinuteShown)}
                                  </p>
                                ) : null}
                                {block.source === "course" && block.courseCode?.trim() ? (
                                  <div
                                    className={cn(
                                      "mt-px min-w-0 space-y-px",
                                      effectiveHeight <= cfg.metaLocPct * 0.35 && "min-h-0",
                                    )}
                                  >
                                    <p
                                      className={cn(
                                        "truncate text-left font-bold tabular-nums leading-none text-classmates-blue dark:text-blue-200",
                                        cfg.blockTitleClass,
                                      )}
                                    >
                                      {block.courseCode.trim()}
                                    </p>
                                    <p
                                      className={cn(
                                        "truncate text-left font-semibold leading-snug",
                                        cfg.blockTitleClass,
                                        !useCategoryColor && tone.title,
                                      )}
                                    >
                                      {block.courseName}
                                    </p>
                                  </div>
                                ) : (
                                  <p
                                    className={cn(
                                      "mt-px min-w-0 truncate text-left font-semibold leading-snug",
                                      cfg.blockTitleClass,
                                      !useCategoryColor && tone.title,
                                      useCategoryColor &&
                                        (shortOverlapGlass ? "" : "text-[#111827] dark:text-foreground"),
                                    )}
                                    style={
                                      useCategoryColor && catHex && shortOverlapGlass
                                        ? { color: categoryAccentColor(catHex) }
                                        : undefined
                                    }
                                  >
                                    {titleLine}
                                  </p>
                                )}
                                {showLocation ? (
                                  <p className={cn("mt-px truncate", metaCls)}>{block.location}</p>
                                ) : null}
                                {showWith ? (
                                  <p className={cn("mt-px truncate", metaCls)}>{block.withLabel}</p>
                                ) : null}
                              </>
                            );
                            const innerCompact = (
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
                                {block.source === "course" && block.courseCode?.trim() ? (
                                  <div className="mt-px min-w-0 space-y-px">
                                    <p
                                      className={cn(
                                        "truncate text-left font-bold tabular-nums leading-none text-classmates-blue dark:text-blue-200",
                                        cfg.blockTitleClass,
                                      )}
                                    >
                                      {block.courseCode.trim()}
                                    </p>
                                    <p
                                      className={cn(
                                        "truncate text-left font-semibold leading-snug",
                                        cfg.blockTitleClass,
                                        !useCategoryColor && (highlighted ? tone.titleSelected : tone.title),
                                      )}
                                    >
                                      {block.courseName}
                                    </p>
                                  </div>
                                ) : (
                                  <p
                                    className={cn(
                                      "mt-px min-w-0 truncate text-left font-semibold leading-snug",
                                      cfg.blockTitleClass,
                                      !useCategoryColor && (highlighted ? tone.titleSelected : tone.title),
                                      useCategoryColor &&
                                        (highlighted
                                          ? "text-white"
                                          : shortOverlapGlass
                                            ? ""
                                            : "text-[#111827] dark:text-foreground"),
                                    )}
                                    style={
                                      useCategoryColor && catHex && shortOverlapGlass && !highlighted
                                        ? { color: categoryAccentColor(catHex) }
                                        : undefined
                                    }
                                  >
                                    {titleLine}
                                  </p>
                                )}
                              </>
                            );
                            const innerExpanded = (
                              <>
                                <p
                                  className={cn(
                                    "break-words font-semibold tabular-nums leading-none",
                                    cfg.blockTimeClass,
                                    !useCategoryColor && tone.accentColorSelected,
                                  )}
                                  style={
                                    useCategoryColor && catHex ? { color: "#ffffff" } : undefined
                                  }
                                >
                                  {formatTime(startMinuteShown)} – {formatTime(endMinuteShown)}
                                </p>
                                {block.source === "course" && block.courseCode?.trim() ? (
                                  <div className="mt-px min-w-0 space-y-px">
                                    <p
                                      className={cn(
                                        "break-words font-bold tabular-nums leading-snug text-classmates-blue dark:text-blue-200",
                                        cfg.blockTitleClass,
                                      )}
                                    >
                                      {block.courseCode.trim()}
                                    </p>
                                    <p
                                      className={cn(
                                        "break-words font-semibold leading-snug",
                                        cfg.blockTitleClass,
                                        !useCategoryColor && tone.titleSelected,
                                      )}
                                    >
                                      {block.courseName}
                                    </p>
                                  </div>
                                ) : (
                                  <p
                                    className={cn(
                                      "mt-px min-w-0 break-words font-semibold leading-snug",
                                      cfg.blockTitleClass,
                                      !useCategoryColor && tone.titleSelected,
                                      useCategoryColor && "text-white",
                                    )}
                                  >
                                    {titleLine}
                                  </p>
                                )}
                                {block.repeatLabel?.trim() ? (
                                  <p className={cn("mt-1", expandedDetailCls)}>
                                    {block.repeatLabel.trim()}
                                  </p>
                                ) : null}
                                {block.location?.trim() ? (
                                  <p className={cn("mt-0.5", expandedDetailCls)}>
                                    {block.location.trim()}
                                  </p>
                                ) : null}
                                {block.withLabel?.trim() ? (
                                  <p className={cn("mt-0.5", expandedDetailCls)}>
                                    {block.withLabel.trim()}
                                  </p>
                                ) : null}
                                {block.note?.trim() ? (
                                  <p className={cn("mt-0.5", expandedDetailCls)}>{block.note.trim()}</p>
                                ) : null}
                              </>
                            );
                            const innerSlot = draggingThis
                              ? innerCompact
                              : expandedCard
                                ? innerExpanded
                                : innerNormal;
                            const railStyle =
                              useCategoryColor && catHex
                                ? { backgroundColor: categoryAccentColor(catHex) }
                                : undefined;
                            const railClass = cn(
                              shortOverlapGlass
                                ? "w-[7px] min-w-[7px] shrink-0 self-stretch rounded-full my-1 ml-1 mr-px"
                                : "w-1 min-w-[4px] shrink-0 self-stretch rounded-l-sm",
                              !useCategoryColor &&
                                (highlighted
                                  ? tone.railSelected
                                  : shortOverlapGlass
                                    ? scheduleShortOverlapRailClass(tone)
                                    : tone.rail),
                            );
                            const innerWithRail = (
                              <div
                                className={cn(
                                  "flex w-full flex-row overflow-hidden rounded-[inherit]",
                                  expandedCard || draggingThis
                                    ? "min-h-0 items-stretch"
                                    : "h-full min-h-0",
                                )}
                              >
                                <div aria-hidden className={railClass} style={railStyle} />
                                <div className="flex min-h-0 min-w-0 flex-1 flex-col items-start justify-start px-1.5 py-1">
                                  {innerSlot}
                                </div>
                              </div>
                            );
                            const title = `${block.courseName} · ${formatTime(startMinuteShown)}`;
                            const columnWidth = 100 / Math.max(block.columnCount, 1);
                            const horizontalGapPct = block.columnCount > 1 ? 0.8 : 0;
                            const widthPct = Math.max(8, columnWidth - horizontalGapPct);
                            const stackInsetPx = block.hasShortOverlap ? Math.min(block.stackDepth * 8, 18) : 0;
                            const eventStackZ = Math.min(
                              Z_EVENT_CARD_BASE + block.columnIndex * 10 + block.stackDepth,
                              Z_EVENT_CARD_DRAGGING - 1,
                            );
                            const cardZ = draggingThis
                              ? Z_EVENT_CARD_DRAGGING
                              : selected
                                ? Math.min(
                                    Math.max(Z_EVENT_CARD_SELECTED, eventStackZ),
                                    Z_EVENT_CARD_DRAGGING - 1,
                                  )
                                : eventStackZ;
                            const positionStyle = expandedCard
                              ? {
                                  top: `${top}%`,
                                  minHeight: `${effectiveHeight}%`,
                                  height: "auto" as const,
                                  left: `calc(${block.columnIndex * columnWidth}% + ${stackInsetPx}px)`,
                                  width: `calc(${widthPct}% - ${stackInsetPx}px)`,
                                  zIndex: cardZ,
                                }
                              : {
                                  top: `${top}%`,
                                  height: `${effectiveHeight}%`,
                                  left: `calc(${block.columnIndex * columnWidth}% + ${stackInsetPx}px)`,
                                  width: `calc(${widthPct}% - ${stackInsetPx}px)`,
                                  zIndex: cardZ,
                                };
                            const surfaceStyle =
                              useCategoryColor && catHex
                                ? {
                                    ...positionStyle,
                                    ...categoryBlockSurfaceStyle(catHex, highlighted, {
                                      shortOverlap: shortOverlapGlass,
                                    }),
                                  }
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
                                  className={cn(className, "touch-none select-none")}
                                  style={surfaceStyle}
                                  title={title}
                                  role="group"
                                >
                                  <div
                                    className={cn(
                                      "overflow-hidden rounded-[inherit]",
                                      expandedCard && "relative",
                                    )}
                                  >
                                    {expandedCard ? (
                                      <>
                                        <div className="relative z-0 w-full rounded-[inherit]">
                                          <div className="pointer-events-none">{innerWithRail}</div>
                                        </div>
                                        <div
                                          role="button"
                                          tabIndex={0}
                                          className={cn(
                                            "absolute inset-0 cursor-grab rounded-[inherit] active:cursor-grabbing",
                                            draggingThis && "cursor-grabbing",
                                          )}
                                          style={{ zIndex: Z_EVENT_DRAG_INNER }}
                                          onKeyDown={(ev) => {
                                            if (ev.key === "Enter" || ev.key === " ") {
                                              ev.preventDefault();
                                              onOpenItem?.(block, occurrenceDate);
                                            }
                                          }}
                                          onPointerDown={(ev) => {
                                            ev.stopPropagation();
                                            startCalendarPointerSession(
                                              ev,
                                              block,
                                              "move",
                                              day,
                                              occurrenceDate,
                                              key,
                                              selected,
                                            );
                                          }}
                                        />
                                      </>
                                    ) : (
                                      <div
                                        role="button"
                                        tabIndex={0}
                                        className={cn(
                                          "absolute inset-0 cursor-grab overflow-hidden rounded-[inherit] active:cursor-grabbing",
                                          draggingThis && "cursor-grabbing",
                                        )}
                                        style={{ zIndex: Z_EVENT_DRAG_INNER }}
                                        onKeyDown={(ev) => {
                                          if (ev.key === "Enter" || ev.key === " ") {
                                            ev.preventDefault();
                                            onOpenItem?.(block, occurrenceDate);
                                          }
                                        }}
                                        onPointerDown={(ev) => {
                                          ev.stopPropagation();
                                          startCalendarPointerSession(
                                            ev,
                                            block,
                                            "move",
                                            day,
                                            occurrenceDate,
                                            key,
                                            selected,
                                          );
                                        }}
                                      >
                                        <div className="pointer-events-none h-full min-h-0 w-full overflow-hidden rounded-[inherit]">
                                          {innerWithRail}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                  {/* Resize handles — only appear when card is selected */}
                                  {selected ? (
                                    <>
                                      <button
                                        type="button"
                                        className="absolute right-1 flex h-6 w-6 cursor-ns-resize touch-none items-center justify-center rounded-full bg-transparent p-0 outline-none"
                                        style={{
                                          zIndex: Z_EVENT_RESIZE_HANDLE,
                                          top: "-4px",
                                          transform: "translateY(-50%)",
                                        }}
                                        aria-label={`Drag anchor to change start time: ${titleLine}`}
                                        onPointerDown={(ev) => {
                                          ev.stopPropagation();
                                          startCalendarPointerSession(
                                            ev,
                                            block,
                                            "resize-start",
                                            day,
                                            occurrenceDate,
                                            key,
                                            true,
                                          );
                                        }}
                                      >
                                        <span
                                          className="pointer-events-none block h-1 w-1 shrink-0 rounded-full bg-[#E53935] shadow-[0_0_0_1px_rgba(255,255,255,0.65)] dark:bg-red-400 dark:shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                                          aria-hidden
                                        />
                                      </button>
                                      <button
                                        type="button"
                                        className="absolute left-1 flex h-6 w-6 cursor-ns-resize touch-none items-center justify-center rounded-full bg-transparent p-0 outline-none"
                                        style={{
                                          zIndex: Z_EVENT_RESIZE_HANDLE,
                                          bottom: "-4px",
                                          transform: "translateY(50%)",
                                        }}
                                        aria-label={`Drag anchor to change end time: ${titleLine}`}
                                        onPointerDown={(ev) => {
                                          ev.stopPropagation();
                                          startCalendarPointerSession(
                                            ev,
                                            block,
                                            "resize-end",
                                            day,
                                            occurrenceDate,
                                            key,
                                            true,
                                          );
                                        }}
                                      >
                                        <span
                                          className="pointer-events-none block h-1 w-1 shrink-0 rounded-full bg-[#E53935] shadow-[0_0_0_1px_rgba(255,255,255,0.65)] dark:bg-red-400 dark:shadow-[0_0_0_1px_rgba(0,0,0,0.35)]"
                                          aria-hidden
                                        />
                                      </button>
                                    </>
                                  ) : null}
                                </div>
                              );
                            }

                            return (
                              <div
                                key={key}
                                className={className}
                                style={surfaceStyle}
                                role="group"
                                title={title}
                              >
                                <button
                                  type="button"
                                  className={cn(
                                    "z-[1] cursor-default rounded-[inherit] border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:focus-visible:ring-blue-400/40",
                                    expandedCard
                                      ? "relative block min-h-0 w-full overflow-hidden"
                                      : "absolute inset-0 overflow-hidden",
                                  )}
                                  onPointerDown={(e) => {
                                    if (block.courseId === "__draft-preview__") return;
                                    attachTapSelectLongOpen(e, block, occurrenceDate, key);
                                  }}
                                  onKeyDown={(ev) => {
                                    if (ev.key === "Enter" || ev.key === " ") {
                                      ev.preventDefault();
                                      if (block.courseId === "__draft-preview__") return;
                                      onOpenItem?.(block, occurrenceDate);
                                    }
                                  }}
                                >
                                  {innerWithRail}
                                </button>
                              </div>
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
  );
}
