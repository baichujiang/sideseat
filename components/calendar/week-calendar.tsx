"use client";

import type { CalendarRepeatRule, Weekday } from "@prisma/client";
import { addDays, addMinutes, format, isSameDay } from "date-fns";
import { MapPin, Repeat2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  WeekEventEditToolbar,
  type WeekEventEditToolbarLabels,
} from "@/components/calendar/week-event-edit-toolbar";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { formatMessage } from "@/lib/i18n/messages";
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
import {
  buildClipboardSessionFromBlock,
  writeCalendarClipboardSession,
} from "@/lib/calendar/calendar-clipboard";
import { cn } from "@/lib/utils";

/** Anchor (resize handle) accent fallback when an event has no category color. */
const DEFAULT_ANCHOR_ACCENT = "#E53935";

const DEFAULT_EDIT_TOOLBAR_LABELS: WeekEventEditToolbarLabels = {
  cut: "Cut",
  copy: "Copy",
  duplicate: "Duplicate",
  delete: "Delete",
  toolbarAriaLabel: "Event actions",
};

/** Multiline summary used when the consumer does not provide a richer copy hook. */
function defaultClipboardTextForBlock(
  block: WeekCalendarBlock,
  occurrenceDate: Date,
): string {
  const fmt = (m: number) => {
    const h = Math.floor(m / 60).toString().padStart(2, "0");
    const mm = (m % 60).toString().padStart(2, "0");
    return `${h}:${mm}`;
  };
  const date = format(occurrenceDate, "yyyy-MM-dd");
  const titleLine = [block.courseCode, block.courseName]
    .filter(Boolean)
    .join(" ")
    .trim() ||
    block.courseName ||
    "Event";
  const lines = [
    titleLine,
    `${date} ${fmt(block.startMinute)} – ${fmt(block.endMinute)}`,
  ];
  if (block.location?.trim()) lines.push(block.location.trim());
  if (block.note?.trim()) lines.push("", block.note.trim());
  return lines.join("\n");
}

async function writeTextToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* fall through to manual fallback */
  }
  /** Legacy fallback for older WebKit / non-secure contexts. */
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    ta.style.pointerEvents = "none";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

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

/** Warm card chrome — outer frame + soft inner grid (not spreadsheet-heavy). */
const WEEK_CALENDAR_CARD = cn(
  "mt-0 overflow-hidden rounded-2xl border border-[#E7E0D6] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]",
  "dark:border-border dark:bg-card dark:shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
);
const WEEK_GRID_LINE = "border-[#F0ECE6] dark:border-white/[0.08]";
const WEEK_COL_DIVIDER = "border-[#F3EFE8] dark:border-white/[0.07]";

/** Past-midnight axis padding — keep smaller than top so scrolling past 24:00 does not leave a tall dead band. */
const VISUAL_PADDING_TOP_MINUTES = 30;
const VISUAL_PADDING_BOTTOM_MINUTES = 12;
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
const Z_DAY_NOW_LINE_SPAN = 33;
const Z_EVENT_CARD_BASE = 3;
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

const POINTER_SLOP_PX = 14;
/** Hold still on a calendar card body, then drag (same 450ms idea as the mini workweek course grid). */
const CALENDAR_MOVE_LONG_PRESS_MS = 450;
const SNAP_MINUTES = 15;
const MIN_EVENT_MINUTES = 15;
/** After this many px of movement, lock 2D scroll to horizontal OR vertical for the rest of the gesture. */
const AXIS_LOCK_THRESHOLD_PX = 24;

export const WEEK_CALENDAR_VISIBLE_DAY_MIN = 2;
export const WEEK_CALENDAR_VISIBLE_DAY_MAX = 7;

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

export function clampWeekCalendarVisibleDayCount(value: number): number {
  if (!Number.isFinite(value)) return DENSITY_LAYOUT.default.visibleWeekDays;
  return Math.max(
    WEEK_CALENDAR_VISIBLE_DAY_MIN,
    Math.min(WEEK_CALENDAR_VISIBLE_DAY_MAX, Math.round(value)),
  );
}

export type WeekCalendarDensity = "default" | "immersive";
export const WEEK_CALENDAR_MINUTE_SCALE_DEFAULT = 1;
export const WEEK_CALENDAR_MINUTE_SCALE_MIN = 0.8;
export const WEEK_CALENDAR_MINUTE_SCALE_MAX = 1.4;

export function clampWeekCalendarMinuteScale(value: number): number {
  if (!Number.isFinite(value)) return WEEK_CALENDAR_MINUTE_SCALE_DEFAULT;
  const clamped = Math.max(
    WEEK_CALENDAR_MINUTE_SCALE_MIN,
    Math.min(WEEK_CALENDAR_MINUTE_SCALE_MAX, value),
  );
  return Math.round(clamped * 1000) / 1000;
}

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
    bottomSpacerPx: 20,
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
    bottomSpacerPx: 18,
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

/** `%` height of a timed block within the visible day window — drives title wrap vs single-line. */
function scheduleEventTitleLayoutClass(effectiveHeightPct: number): string {
  if (effectiveHeightPct >= 14) {
    return "whitespace-normal break-words [overflow-wrap:anywhere] text-left";
  }
  if (effectiveHeightPct >= 8) {
    return "line-clamp-2 whitespace-normal break-words [overflow-wrap:anywhere] text-left";
  }
  return "truncate text-left";
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
  onDeleteCalendarEvent,
  onDuplicateCalendarEvent,
  onCopyCalendarEvent,
  editToolbarLabels,
  density = "default",
  minuteScale = WEEK_CALENDAR_MINUTE_SCALE_DEFAULT,
  onMinuteScaleChange,
  visibleDayCount,
  /** When set (e.g. fullscreen), overrides the scroll viewport height in px. */
  viewportBodyPx,
  /** Remove outer top margin — use inside a flex fill container. */
  fillParent = false,
  /**
   * When the week grid sits inside a parent `rotate(90deg)` (portrait phone → logical landscape),
   * screen-space touch deltas must be rotated to match the un-transformed scroll box, or axis-lock
   * picks the wrong axis and vertical time scroll feels broken.
   */
  touchGestureRotateCw90 = false,
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
  /** Open edit/detail from parent — timed events: detail sheet "编辑" (and keyboard Enter/Space); all-day: row edit. */
  onOpenItem?: (item: WeekCalendarBlock, occurrenceDate: Date) => void;
  /** Drag / resize calendar events (PATCH start/end only). */
  onPatchCalendarEventTimes?: (args: { eventId: string; startAt: Date; endAt: Date }) => Promise<boolean>;
  /**
   * Delete an editable calendar entry. When omitted (or returns false), the
   * delete action is hidden from the floating edit toolbar.
   */
  onDeleteCalendarEvent?: (args: {
    eventId: string;
    repeatRule: CalendarRepeatRule;
  }) => Promise<boolean> | boolean;
  /**
   * Duplicate an editable calendar entry. `block` is the selected block; the
   * parent decides the new start/end (typically `endAt` + duration).
   */
  onDuplicateCalendarEvent?: (args: {
    block: WeekCalendarBlock;
    occurrenceDate: Date;
  }) => Promise<boolean> | boolean;
  /**
   * Optional copy hook (so the parent can include fields not visible here, e.g.
   * note + participants). When omitted, we fall back to copying a readable
   * summary based on the WeekCalendarBlock.
   */
  /**
   * Rich copy: write to the system clipboard inside this hook, then return
   * `{ summaryText }` (same string) so we can mirror it into sessionStorage.
   * If omitted, we copy `defaultClipboardTextForBlock` and still store session.
   */
  onCopyCalendarEvent?: (args: {
    block: WeekCalendarBlock;
    occurrenceDate: Date;
  }) => Promise<{ summaryText: string } | void> | { summaryText: string } | void;
  /** Localized labels for the floating edit toolbar. When omitted, English defaults are used. */
  editToolbarLabels?: WeekEventEditToolbarLabels;
  density?: WeekCalendarDensity;
  minuteScale?: number;
  onMinuteScaleChange?: (nextScale: number) => void;
  visibleDayCount?: number;
  viewportBodyPx?: number;
  fillParent?: boolean;
  touchGestureRotateCw90?: boolean;
}) {
  const { locale, messages: appMessages } = useLocaleContext();
  const sch = appMessages.schedule;
  const dayColWeekdayFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short" }),
    [locale],
  );
  const dayColDayMonthFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }),
    [locale],
  );
  const createEventWhenFmt = useMemo(
    () => new Intl.DateTimeFormat(locale, { weekday: "short", month: "short", day: "numeric" }),
    [locale],
  );

  const cfg = DENSITY_LAYOUT[density];
  const resolvedMinuteScale = clampWeekCalendarMinuteScale(minuteScale);
  const TIME_COLUMN_PX = cfg.timeColumnPx;
  const MINUTE_PX = cfg.minutePx * resolvedMinuteScale;
  const BOTTOM_SPACER_PX = cfg.bottomSpacerPx;
  const VISIBLE_WEEK_DAYS = visibleDayCount
    ? clampWeekCalendarVisibleDayCount(visibleDayCount)
    : cfg.visibleWeekDays;
  const DEFAULT_VIEW_START = cfg.viewStart;
  const DEFAULT_VIEW_END = cfg.viewEnd;

  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const [frameWidth, setFrameWidth] = useState(0);
  const previousMinutePxRef = useRef(MINUTE_PX);
  const minutePxRef = useRef(MINUTE_PX);
  const minuteScaleRef = useRef(resolvedMinuteScale);
  const onMinuteScaleChangeRef = useRef(onMinuteScaleChange);
  const minuteScaleAnchorRef = useRef<{ minute: number; offsetY: number } | null>(null);

  /**
   * Currently selected calendar entry. Long-press on an event body selects it
   * and shows the edit toolbar + resize anchors; move/resize drag is only
   * allowed while selected. Single tap opens the detail sheet.
   */
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  /** Per-eventId DOM node ref so the toolbar can anchor to the visible block. */
  const eventCardElsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const [dragOverride, setDragOverride] = useState<{
    eventId: string;
    weekday: Weekday;
    startMinute: number;
    endMinute: number;
  } | null>(null);
  const dayBodyElRef = useRef<Map<Weekday, HTMLDivElement | null>>(new Map());
  /** After PATCH success, keep `dragOverride` until `blocks` reflect new times (avoids one frame of old position). */
  const pendingDragClearRef = useRef<{
    eventId: string;
    weekday: Weekday;
    startMinute: number;
    endMinute: number;
  } | null>(null);
  const dragClearFallbackTimerRef = useRef<number | null>(null);

  /** Momentum animation handle for touch-scroll inertia. */
  const momentumRafRef = useRef<number | null>(null);

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
  const visualStartMinute = -VISUAL_PADDING_TOP_MINUTES;
  const visualEndMinute = FULL_DAY_MINUTES + VISUAL_PADDING_BOTTOM_MINUTES;
  const totalMinutes = visualEndMinute - visualStartMinute;
  const hourLabels: number[] = [];
  for (let m = 0; m <= FULL_DAY_MINUTES; m += 60) hourLabels.push(m);

  const fullHeightPx = totalMinutes * MINUTE_PX;
  /** Visible window height — same formula as {@link ScheduleDayTimeline} (header scrolls inside content). */
  const computedViewportBodyPx =
    (DEFAULT_VIEW_END -
      DEFAULT_VIEW_START +
      VISUAL_PADDING_TOP_MINUTES +
      VISUAL_PADDING_BOTTOM_MINUTES) *
    MINUTE_PX;
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

  /**
   * Snap the timed grid so 08:00 is the first visible window (same window as portrait default density).
   * useLayoutEffect + `frameWidth`: inner track is gated until width is measured; an early useEffect could
   * clamp scrollTop before content height exists and never re-run.
   */
  useLayoutEffect(() => {
    const scrollTop =
      (DEFAULT_VIEW_START - VISUAL_PADDING_TOP_MINUTES - visualStartMinute) * MINUTE_PX;
    const node = scrollContainerRef.current;
    if (node && frameWidth > 0) {
      node.scrollTop = scrollTop;
      previousMinutePxRef.current = MINUTE_PX;
      minuteScaleAnchorRef.current = null;
    }
  }, [visualStartMinute, weekStartDate, focusDate, DEFAULT_VIEW_START, density, frameWidth]);

  useLayoutEffect(() => {
    const node = scrollContainerRef.current;
    const prevMinutePx = previousMinutePxRef.current;
    if (!node || frameWidth <= 0 || Math.abs(prevMinutePx - MINUTE_PX) < 0.0001) {
      previousMinutePxRef.current = MINUTE_PX;
      return;
    }

    const anchor = minuteScaleAnchorRef.current;
    const topMinute = visualStartMinute + node.scrollTop / prevMinutePx;
    const nextScrollTop = anchor
      ? (anchor.minute - visualStartMinute) * MINUTE_PX - anchor.offsetY
      : (topMinute - visualStartMinute) * MINUTE_PX;
    const maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
    node.scrollTop = Math.max(0, Math.min(maxScrollTop, nextScrollTop));
    previousMinutePxRef.current = MINUTE_PX;
    minuteScaleAnchorRef.current = null;
  }, [MINUTE_PX, visualStartMinute, frameWidth]);

  useEffect(() => {
    minutePxRef.current = MINUTE_PX;
    minuteScaleRef.current = resolvedMinuteScale;
    onMinuteScaleChangeRef.current = onMinuteScaleChange;
  }, [MINUTE_PX, resolvedMinuteScale, onMinuteScaleChange]);

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

  /** Selection: clear when the week changes (selection is per-week-view ephemeral). */
  useEffect(() => {
    setSelectedEventId(null);
  }, [weekStartDate, focusDate]);

  /**
   * Selection: drop when the underlying event disappears from the rendered set
   * (deleted, moved out of the current window, navigated away).
   */
  useEffect(() => {
    if (!selectedEventId) return;
    const stillThere = blocks.some(
      (b) => b.calendarEntryId === selectedEventId && b.source === "calendar",
    );
    if (!stillThere) setSelectedEventId(null);
  }, [blocks, selectedEventId]);

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
    const node = scrollContainerRef.current;
    if (!node) return;

    // ---- Mouse / trackpad: correct non-dominant axis via scroll events ----
    let mouseDown = false;
    let mouseOriginL = 0;
    let mouseOriginT = 0;
    let mouseLock: "free" | "h" | "v" = "free";

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      mouseDown = true;
      mouseLock = "free";
      mouseOriginL = node.scrollLeft;
      mouseOriginT = node.scrollTop;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      mouseDown = false;
      mouseLock = "free";
    };
    const onScroll = () => {
      if (!mouseDown) return;
      const dx = node.scrollLeft - mouseOriginL;
      const dy = node.scrollTop - mouseOriginT;
      if (mouseLock === "free") {
        if (dx * dx + dy * dy < AXIS_LOCK_THRESHOLD_PX * AXIS_LOCK_THRESHOLD_PX) return;
        mouseLock = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
      }
      if (mouseLock === "h") node.scrollTop = mouseOriginT;
      else if (mouseLock === "v") node.scrollLeft = mouseOriginL;
    };

    // ---- Touch: manual scroll with axis lock + inertia ----
    // CSS `touch-action: none` on the container prevents the browser from
    // performing native touch scroll; we replicate it here with axis locking
    // and momentum.  Mouse / trackpad / wheel are unaffected by touch-action.
    //
    // Important: while the axis is still "free", we must not apply both
    // scrollLeft and scrollTop deltas — that diagonal coupling reads as jitter
    // at gesture start.  We stay in a movement deadzone (no scroll) until the
    // threshold, then map position from touch origin on a single axis only.
    let tid: number | null = null;
    let t0x = 0;
    let t0y = 0;
    let scrollL0 = 0;
    let scrollT0 = 0;
    let tx = 0;
    let ty = 0;
    let tt = 0;
    let vx = 0;
    let vy = 0;
    let tLock: "free" | "h" | "v" = "free";
    let pinchTouchIds: [number, number] | null = null;
    let pinchStartDistance = 0;
    let pinchStartScale = minuteScaleRef.current;
    let pinchLastScale = minuteScaleRef.current;
    let pinchMoveAttached = false;

    const stopMomentum = () => {
      if (momentumRafRef.current !== null) {
        cancelAnimationFrame(momentumRafRef.current);
        momentumRafRef.current = null;
      }
    };

    const findTrackedTouch = (touches: TouchList, identifier: number) => {
      for (let i = 0; i < touches.length; i++) {
        if (touches[i].identifier === identifier) return touches[i];
      }
      return null;
    };

    const pinchTouchesFromList = (touches: TouchList): [Touch, Touch] | null => {
      if (pinchTouchIds) {
        const first = findTrackedTouch(touches, pinchTouchIds[0]);
        const second = findTrackedTouch(touches, pinchTouchIds[1]);
        return first && second ? [first, second] : null;
      }
      if (touches.length < 2) return null;
      return [touches[0], touches[1]];
    };

    const pinchDistance = (first: Touch, second: Touch) =>
      Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);

    const updatePinchAnchorAndScale = (nextScale: number, anchorClientY: number) => {
      const next = clampWeekCalendarMinuteScale(nextScale);
      if (Math.abs(next - pinchLastScale) < 0.01) return;

      const rect = node.getBoundingClientRect();
      const anchorOffsetY = Math.max(0, Math.min(node.clientHeight, anchorClientY - rect.top));
      const currentMinute =
        visualStartMinute + (node.scrollTop + anchorOffsetY) / minutePxRef.current;
      minuteScaleAnchorRef.current = {
        minute: currentMinute,
        offsetY: anchorOffsetY,
      };
      pinchLastScale = next;
      onMinuteScaleChangeRef.current?.(next);
    };

    const removePinchMoveListener = () => {
      if (!pinchMoveAttached) return;
      node.removeEventListener("touchmove", onPinchTouchMove);
      pinchMoveAttached = false;
    };

    const endPinch = () => {
      pinchTouchIds = null;
      pinchStartDistance = 0;
      pinchStartScale = minuteScaleRef.current;
      pinchLastScale = minuteScaleRef.current;
      removePinchMoveListener();
    };

    const beginPinch = (touches: TouchList) => {
      const pair = pinchTouchesFromList(touches);
      if (!pair) return;
      stopMomentum();
      tid = null;
      tLock = "free";
      vx = 0;
      vy = 0;
      pinchTouchIds = [pair[0].identifier, pair[1].identifier];
      pinchStartDistance = pinchDistance(pair[0], pair[1]);
      pinchStartScale = minuteScaleRef.current;
      pinchLastScale = minuteScaleRef.current;
      if (!pinchMoveAttached) {
        node.addEventListener("touchmove", onPinchTouchMove, { passive: false });
        pinchMoveAttached = true;
      }
    };

    function onPinchTouchMove(e: TouchEvent) {
      if (!pinchTouchIds) return;
      const pair = pinchTouchesFromList(e.touches);
      if (!pair || pinchStartDistance <= 0) return;
      e.preventDefault();
      const currentDistance = pinchDistance(pair[0], pair[1]);
      if (currentDistance <= 0) return;
      const rawRatio = currentDistance / pinchStartDistance;
      const dampedRatio = 1 + (rawRatio - 1) * 0.85;
      const anchorY = (pair[0].clientY + pair[1].clientY) / 2;
      updatePinchAnchorAndScale(pinchStartScale * dampedRatio, anchorY);
    }

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length >= 2 && onMinuteScaleChangeRef.current) {
        beginPinch(e.touches);
        return;
      }
      if (pinchTouchIds) return;
      if (tid !== null) return;
      const rawTarget = e.target;
      if (
        rawTarget instanceof Element &&
        rawTarget.closest("[data-week-calendar-drag-root]")
      ) {
        /* Draggable event pills use pointer + long-press; do not bind this touch to axis-scroll. */
        return;
      }
      stopMomentum();
      const t = e.changedTouches[0];
      tid = t.identifier;
      t0x = tx = t.clientX;
      t0y = ty = t.clientY;
      scrollL0 = node.scrollLeft;
      scrollT0 = node.scrollTop;
      tt = performance.now();
      vx = vy = 0;
      tLock = "free";
    };

    const onTouchMove = (e: TouchEvent) => {
      if (pinchTouchIds) return;
      if (tid === null || calendarDragSelectLockDepth > 0) return;
      let touch: Touch | undefined;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === tid) {
          touch = e.changedTouches[i];
          break;
        }
      }
      if (!touch) return;

      const now = performance.now();
      const dt = Math.max(now - tt, 1);
      const rawIncDx = touch.clientX - tx;
      const rawIncDy = touch.clientY - ty;
      const rawTotalDx = touch.clientX - t0x;
      const rawTotalDy = touch.clientY - t0y;
      const totalDx = touchGestureRotateCw90 ? rawTotalDy : rawTotalDx;
      const totalDy = touchGestureRotateCw90 ? -rawTotalDx : rawTotalDy;
      const dx = touchGestureRotateCw90 ? rawIncDy : rawIncDx;
      const dy = touchGestureRotateCw90 ? -rawIncDx : rawIncDy;
      const totalDist2 = totalDx * totalDx + totalDy * totalDy;

      if (tLock === "free") {
        if (totalDist2 < AXIS_LOCK_THRESHOLD_PX * AXIS_LOCK_THRESHOLD_PX) {
          const a = 0.4;
          vx = a * ((dx / dt) * 1000) + (1 - a) * vx;
          vy = a * ((dy / dt) * 1000) + (1 - a) * vy;
          tx = touch.clientX;
          ty = touch.clientY;
          tt = now;
          return;
        }
        tLock = Math.abs(totalDx) > Math.abs(totalDy) ? "h" : "v";
      }

      const maxL = Math.max(0, node.scrollWidth - node.clientWidth);
      const maxT = Math.max(0, node.scrollHeight - node.clientHeight);
      if (tLock === "h") {
        node.scrollTop = scrollT0;
        node.scrollLeft = Math.max(0, Math.min(maxL, scrollL0 - totalDx));
      } else {
        node.scrollLeft = scrollL0;
        node.scrollTop = Math.max(0, Math.min(maxT, scrollT0 - totalDy));
      }

      const a = 0.4;
      vx = a * ((dx / dt) * 1000) + (1 - a) * vx;
      vy = a * ((dy / dt) * 1000) + (1 - a) * vy;
      tx = touch.clientX;
      ty = touch.clientY;
      tt = now;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (pinchTouchIds) {
        const pair = pinchTouchesFromList(e.touches);
        if (!pair) endPinch();
        return;
      }
      let found = false;
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (e.changedTouches[i].identifier === tid) {
          found = true;
          break;
        }
      }
      if (!found) return;

      const endLock = tLock;
      tid = null;
      tLock = "free";

      let mvx = endLock === "v" ? 0 : -vx;
      let mvy = endLock === "h" ? 0 : -vy;
      const DECEL = 0.965;
      const STOP_V = 30;
      let prev = performance.now();

      const tick = () => {
        const now = performance.now();
        const s = (now - prev) / 1000;
        prev = now;
        const f = Math.pow(DECEL, s * 60);
        mvx *= f;
        mvy *= f;
        if (Math.abs(mvx) < STOP_V && Math.abs(mvy) < STOP_V) {
          momentumRafRef.current = null;
          return;
        }
        node.scrollLeft += mvx * s;
        node.scrollTop += mvy * s;
        momentumRafRef.current = requestAnimationFrame(tick);
      };

      if (Math.abs(mvx) > STOP_V || Math.abs(mvy) > STOP_V) {
        momentumRafRef.current = requestAnimationFrame(tick);
      }
    };

    node.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: true });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchEnd, { passive: true });

    return () => {
      node.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      node.removeEventListener("scroll", onScroll);
      node.removeEventListener("touchstart", onTouchStart);
      node.removeEventListener("touchmove", onTouchMove);
      node.removeEventListener("touchend", onTouchEnd);
      node.removeEventListener("touchcancel", onTouchEnd);
      removePinchMoveListener();
      stopMomentum();
    };
  }, [touchGestureRotateCw90, visualStartMinute]);

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

  /** Tap → open detail sheet via parent callback. */
  function attachTapOpen(
    e: React.PointerEvent,
    block: WeekCalendarBlock,
    occurrenceDate: Date,
  ) {
    if (block.courseId === "__draft-preview__") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();
    const pointerId = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;

    const detach = () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onUp);
    };

    const onMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > POINTER_SLOP_PX) {
        detach();
      }
    };

    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      detach();
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) <= POINTER_SLOP_PX) {
        onOpenItem?.(block, occurrenceDate);
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

    const isResizeMode = mode === "resize-start" || mode === "resize-end";

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

    /** Resize uses the same slop gate as body move so the first committed intent is stable. */
    let activatedForDrag = false;
    let didMove = false;
    /** True once this gesture may move-drag: started selected, or long-press just selected this block. */
    let canDragMove = moveFromSelected;
    /** Long-press on body arms **selection** (toolbar + anchors), not an immediate drag. */
    let selectHoldTimer: number | null = null;
    let longPressDidSelect = false;

    const preventScroll = (ev: TouchEvent) => {
      ev.preventDefault();
    };

    const clearSelectHoldTimer = () => {
      if (selectHoldTimer != null) {
        window.clearTimeout(selectHoldTimer);
        selectHoldTimer = null;
      }
    };

    if (mode === "move" && !moveFromSelected) {
      selectHoldTimer = window.setTimeout(() => {
        selectHoldTimer = null;
        longPressDidSelect = true;
        canDragMove = true;
        setSelectedEventId(eventId);
      }, CALENDAR_MOVE_LONG_PRESS_MS);
    }

    const detach = () => {
      clearSelectHoldTimer();
      document.removeEventListener("pointermove", onDocMove);
      document.removeEventListener("pointerup", onDocUp);
      document.removeEventListener("pointercancel", onDocUp);
      document.removeEventListener("touchmove", preventScroll);
      unlockBrowserTextSelectionForCalendarDrag();
    };

    const activateCalendarDrag = () => {
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
    };

    const onDocMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!activatedForDrag) {
        const pastSlop = Math.hypot(ev.clientX - x0, ev.clientY - y0) > POINTER_SLOP_PX;
        if (selectHoldTimer != null && pastSlop) {
          /* Moved before long-press — cancel selection arm (e.g. week pan / scroll). */
          clearSelectHoldTimer();
          detach();
          return;
        }
        if (isResizeMode && pastSlop) {
          /* Handle hit: commit to resize only — weekday stays on the starting column for the whole gesture. */
          curWeekday = fromWeekday;
          activateCalendarDrag();
          return;
        }
        if (mode === "move" && pastSlop && canDragMove) {
          /* Body move-drag only after this event is selected (or long-press selected it this gesture). */
          activateCalendarDrag();
          return;
        }
        return;
      }
      if (!didMove && Math.hypot(ev.clientX - x0, ev.clientY - y0) > POINTER_SLOP_PX) {
        didMove = true;
      }
      if (mode === "move") {
        const hit = weekdayFromClientXY(ev.clientX, ev.clientY);
        if (hit) curWeekday = hit;
      }
      /* Resize: never follow the pointer into adjacent day columns — that read as a combined move + resize. */
      const minuteDay: Weekday = mode === "move" ? curWeekday : fromWeekday;
      const m = rawMinuteFromClientYForDay(ev.clientY, minuteDay);
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
      detach();

      if (!activatedForDrag) {
        if (mode === "move") {
          if (longPressDidSelect) {
            /* Long-press ended selection only — do not open detail. */
            return;
          }
          const withinTapSlop =
            Math.hypot(ev.clientX - x0, ev.clientY - y0) <= POINTER_SLOP_PX;
          if (withinTapSlop) {
            /* Short tap (no drag, no long-press): open detail / edit sheet; clear selection. */
            onOpenItem?.(block, occurrenceDate);
            setSelectedEventId(null);
          }
        }
        return;
      }

      if (!didMove && mode === "move") {
        setDragOverride(null);
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

  /**
   * Currently selected (toolbar-visible) block — looked up live from the rendered
   * `effectiveBlocks` so dragOverride positions / new categories follow without a
   * second pass.
   */
  const selectedBlock = useMemo<WeekCalendarBlock | null>(() => {
    if (!selectedEventId) return null;
    return (
      effectiveBlocks.find(
        (b) => b.source === "calendar" && b.calendarEntryId === selectedEventId,
      ) ?? null
    );
  }, [effectiveBlocks, selectedEventId]);

  const selectedOccurrenceDate = useMemo<Date | null>(() => {
    if (!selectedBlock) return null;
    const dayIndex = DAY_ORDER.indexOf(selectedBlock.weekday);
    if (dayIndex < 0) return null;
    return addDays(weekStartDate, dayIndex);
  }, [selectedBlock, weekStartDate]);

  /**
   * Live DOM anchor for the toolbar (null while dragging or unselected). We
   * re-read the ref map on every render because `blocks` reflowing can replace
   * the underlying DOM node; depending on a stable ref ID is unreliable here.
   */
  const selectedAnchorEl =
    selectedEventId && !dragOverride
      ? eventCardElsRef.current.get(selectedEventId) ?? null
      : null;

  const resolvedToolbarLabels = editToolbarLabels ?? DEFAULT_EDIT_TOOLBAR_LABELS;

  const dismissSelection = useCallback(() => {
    setSelectedEventId(null);
  }, []);

  const persistCalendarCopyToClipboardAndSession = useCallback(
    async (
      kind: "copy" | "cut",
      snapshot?: { block: WeekCalendarBlock; occurrenceDate: Date },
    ) => {
      const block = snapshot?.block ?? selectedBlock;
      const occurrenceDate = snapshot?.occurrenceDate ?? selectedOccurrenceDate;
      if (!block || !occurrenceDate) return;
      let summaryText: string;
      if (onCopyCalendarEvent) {
        const ret = await onCopyCalendarEvent({ block, occurrenceDate });
        summaryText =
          ret && typeof ret === "object" && typeof ret.summaryText === "string"
            ? ret.summaryText
            : defaultClipboardTextForBlock(block, occurrenceDate);
      } else {
        summaryText = defaultClipboardTextForBlock(block, occurrenceDate);
        await writeTextToClipboard(summaryText);
      }
      writeCalendarClipboardSession(
        buildClipboardSessionFromBlock(block, occurrenceDate, kind, summaryText),
      );
    },
    [onCopyCalendarEvent, selectedBlock, selectedOccurrenceDate],
  );

  const handleCopySelection = useCallback(async () => {
    if (!selectedBlock || !selectedOccurrenceDate) return;
    await persistCalendarCopyToClipboardAndSession("copy");
    setSelectedEventId(null);
  }, [persistCalendarCopyToClipboardAndSession, selectedBlock, selectedOccurrenceDate]);

  const handleCutSelection = useCallback(async () => {
    if (!selectedBlock || !selectedOccurrenceDate || !selectedEventId) return;
    const eventId = selectedEventId;
    const repeatRule = selectedBlock.repeatRule ?? "NONE";
    const snapshot = { block: selectedBlock, occurrenceDate: selectedOccurrenceDate };
    /** Same as delete: dismiss toolbar immediately so no follow-up tap lands on the card while work is in flight. */
    setSelectedEventId(null);
    // Copy first so the user keeps a system-clipboard reference if delete fails.
    await persistCalendarCopyToClipboardAndSession("cut", snapshot);
    if (!onDeleteCalendarEvent) return;
    const ok = await onDeleteCalendarEvent({ eventId, repeatRule });
    if (!ok) setSelectedEventId(eventId);
  }, [
    onDeleteCalendarEvent,
    persistCalendarCopyToClipboardAndSession,
    selectedBlock,
    selectedOccurrenceDate,
    selectedEventId,
  ]);

  const handleDuplicateSelection = useCallback(async () => {
    if (!selectedBlock || !selectedOccurrenceDate) return;
    if (!onDuplicateCalendarEvent) {
      setSelectedEventId(null);
      return;
    }
    const ok = await onDuplicateCalendarEvent({
      block: selectedBlock,
      occurrenceDate: selectedOccurrenceDate,
    });
    if (ok) setSelectedEventId(null);
  }, [onDuplicateCalendarEvent, selectedBlock, selectedOccurrenceDate]);

  const handleDeleteSelection = useCallback(async () => {
    if (!selectedEventId) return;
    if (!onDeleteCalendarEvent) {
      setSelectedEventId(null);
      return;
    }
    if (!selectedBlock) {
      setSelectedEventId(null);
      return;
    }
    const eventId = selectedEventId;
    const repeatRule = selectedBlock.repeatRule ?? "NONE";
    /** Close toolbar immediately so no follow-up click lands on the card while DELETE is in flight. */
    setSelectedEventId(null);
    const ok = await onDeleteCalendarEvent({ eventId, repeatRule });
    if (!ok) setSelectedEventId(eventId);
  }, [onDeleteCalendarEvent, selectedEventId, selectedBlock]);

  const suppressNativeSelectUnlessFormField = useCallback((e: Event) => {
    const t = e.target as HTMLElement | null;
    if (t?.closest?.("input, textarea, select, option, [contenteditable='true']")) return;
    e.preventDefault();
  }, []);

  useEffect(() => {
    const node = scrollContainerRef.current;
    if (!node) return;
    node.addEventListener("selectstart", suppressNativeSelectUnlessFormField);
    return () => node.removeEventListener("selectstart", suppressNativeSelectUnlessFormField);
  }, [suppressNativeSelectUnlessFormField]);

  return (
    <div
      className={cn(
        "select-none [-webkit-user-select:none] [-webkit-touch-callout:none]",
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
          "min-w-0 touch-none select-none overflow-auto overscroll-contain [-webkit-user-select:none]",
          "[&_input]:select-auto [&_textarea]:select-text [&_select]:select-auto",
          fillParent ? "min-h-0 min-w-0 flex-1" : null,
        )}
        style={fillParent ? undefined : { height: `${WEEK_HEADER_HEIGHT_PX + viewportHeightPx}px` }}
      >
        {frameWidth === 0 ? null : <div className="bg-white dark:bg-card" style={{ width: trackWidthPx }}>
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
            >
              {sch.timeColumnLabel}
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
                    <div className="flex max-h-full flex-col items-center mt-1 mb-1 justify-center gap-px">
                      <span
                        className={cn(
                          "text-[10px] tabular-nums leading-none",
                          isToday
                            ? "font-bold text-[#E53935] dark:text-red-400"
                            : cn(
                                "font-medium text-[#9CA3AF]",
                                isWeekend && !isToday && "text-[#B8C0CC]",
                                anchorWeekday === day && !isToday && "font-semibold text-[#5F6B7A] dark:text-muted-foreground",
                              ),
                        )}
                      >
                        {dayColWeekdayFmt.format(date)}
                      </span>
                      <span
                        className={cn(
                          "inline-flex h-[20px] min-w-0 max-w-full shrink items-center justify-center whitespace-nowrap rounded-full px-1.5 text-[10px] font-semibold leading-none",
                          isToday
                            ? "bg-[#E53935] text-white shadow-sm dark:bg-red-500"
                            : cn(
                                "font-medium text-[#6B7280]",
                                isWeekend && !isToday && "text-[#9CA3AF]",
                                anchorWeekday === day && !isToday && "font-semibold text-[#374151] dark:text-foreground",
                              ),
                        )}
                      >
                        {dayColDayMonthFmt.format(date)}
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
                  {sch.allDayRowLabel}
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
                        return (
                          <div
                            key={`${block.calendarEntryId ?? block.courseId}-allday-${bi}`}
                            className="relative w-full"
                          >
                            <button
                              type="button"
                              tabIndex={0}
                              onPointerDown={(e) => attachTapOpen(e, block, occurrenceDate)}
                              onKeyDown={(ev) => {
                                if (ev.key === "Enter" || ev.key === " ") {
                                  ev.preventDefault();
                                  onOpenItem?.(block, occurrenceDate);
                                }
                              }}
                              className={cn(
                                "relative z-[1] w-full overflow-hidden rounded-[2px] p-0 text-left text-[10px] font-semibold leading-tight transition outline-none",
                                "hover:brightness-[0.98] active:brightness-95",
                                "focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:focus-visible:ring-blue-400/40",
                                !useCategory && tone.card,
                                useCategory && "border border-black/10 shadow-sm dark:border-white/10",
                              )}
                              style={
                                useCategory && catHex
                                  ? categoryBlockSurfaceStyle(catHex, false)
                                  : undefined
                              }
                            >
                              <span className="relative flex min-w-0 flex-row overflow-hidden rounded-[inherit]">
                                <span
                                  aria-hidden
                                  className={cn(
                                    "w-1 shrink-0 self-stretch rounded-l-[2px]",
                                    !useCategory && tone.rail,
                                    useCategory && catHex && "bg-transparent",
                                  )}
                                  style={
                                    useCategory && catHex
                                      ? { backgroundColor: categoryAccentColor(catHex) }
                                      : undefined
                                  }
                                />
                                <span className="flex min-w-0 flex-1 flex-col gap-px px-1.5 py-1">
                                  {block.source === "course" && block.courseCode?.trim() ? (
                                    <>
                                      <span className="truncate font-bold tabular-nums leading-tight text-classmates-blue dark:text-blue-200">
                                        {block.courseCode.trim()}
                                      </span>
                                      <span
                                        className={cn(
                                          "min-w-0 font-semibold leading-snug text-[#111827] dark:text-foreground",
                                          "line-clamp-2 whitespace-normal break-words [overflow-wrap:anywhere] text-left",
                                        )}
                                      >
                                        {block.courseName}
                                      </span>
                                    </>
                                  ) : (
                                    <span
                                      className={cn(
                                        "min-w-0 leading-snug",
                                        "line-clamp-2 whitespace-normal break-words [overflow-wrap:anywhere] text-left",
                                      )}
                                    >
                                      {labelText || block.courseName}
                                    </span>
                                  )}
                                </span>
                                {block.repeatRule != null && block.repeatRule !== "NONE" && (
                                  <Repeat2
                                    aria-label="重复事件"
                                    className={cn(
                                      "pointer-events-none absolute right-0.5 top-0.5 h-2.5 w-2.5 shrink-0",
                                      useCategory
                                        ? "text-[#111827]/40 dark:text-white/40"
                                        : "text-[#111827]/35 dark:text-muted-foreground/50",
                                    )}
                                    style={
                                      useCategory && catHex
                                        ? { color: catHex, opacity: 0.55 }
                                        : undefined
                                    }
                                  />
                                )}
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
                      const occurrenceDate = addDays(weekStartDate, dayIndex);

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
                            aria-label={formatMessage(sch.createEventOnDayAria, {
                              when: createEventWhenFmt.format(occurrenceDate),
                            })}
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
                            const effectiveHeight = Math.max(4, height);
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
                            const draggingThis = Boolean(
                              dragOverride?.eventId && block.calendarEntryId === dragOverride.eventId,
                            );
                            /** Saturated fill / compact type — only while `dragOverride` is active, not toolbar selection. */
                            const highlighted = draggingThis;
                            const shortOverlapGlass = Boolean(block.hasShortOverlap && !highlighted);
                            const catHex = block.categoryColor?.trim();
                            const useCategoryColor = block.source === "calendar" && Boolean(catHex);
                            const isDraggableCalendar =
                              Boolean(onPatchCalendarEventTimes) &&
                              block.source === "calendar" &&
                              Boolean(block.calendarEntryId) &&
                              block.courseId !== "__draft-preview__";
                            /** Toolbar + resize anchors — distinct from `draggingThis` visuals (see interaction chrome below). */
                            const isSelectedForEdit =
                              isDraggableCalendar &&
                              Boolean(block.calendarEntryId) &&
                              selectedEventId === block.calendarEntryId;
                            const startMinuteShown = draggingThis
                              ? snapMinute(block.startMinute)
                              : block.startMinute;
                            const endMinuteShown = draggingThis
                              ? snapMinute(block.endMinute)
                              : block.endMinute;
                            const eventCardVisualClassName = cn(
                              "absolute rounded-[2px] p-0 text-left leading-tight transition",
                              draggingThis && "!transition-none",
                              /* Pressed-state dim reads like “dragging” while the finger is still down after long-press select. */
                              isSelectedForEdit && !draggingThis
                                ? "hover:brightness-[0.99]"
                                : "hover:brightness-[0.98] active:brightness-95",
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
                              isSelectedForEdit &&
                                !draggingThis &&
                                "scale-[1.01] ring-2 ring-[#2563EB]/40 ring-offset-2 ring-offset-white dark:ring-blue-400/45 dark:ring-offset-card",
                              draggingThis &&
                                "scale-[1.02] shadow-[0_16px_40px_-12px_rgba(15,23,42,0.35)] ring-2 ring-[#E53935]/55 ring-offset-2 ring-offset-white dark:ring-red-400/50 dark:ring-offset-card",
                            );
                            const className = cn(eventCardVisualClassName, "overflow-hidden");
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
                            const titleLayout = scheduleEventTitleLayoutClass(effectiveHeight);
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
                                        titleLayout,
                                        "font-semibold leading-snug",
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
                                      "mt-px min-w-0 font-semibold leading-snug",
                                      titleLayout,
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
                                  <p className={cn("mt-px flex items-center gap-0.5 truncate", metaCls)}>
                                    <MapPin className="h-2.5 w-2.5 shrink-0 opacity-70" strokeWidth={2.25} aria-hidden />
                                    <span className="truncate">{block.location}</span>
                                  </p>
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
                                        titleLayout,
                                        "font-semibold leading-snug",
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
                                      "mt-px min-w-0 font-semibold leading-snug",
                                      titleLayout,
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
                            const innerSlot = draggingThis
                              ? innerCompact
                              : innerNormal;
                            const railStyle =
                              useCategoryColor && catHex
                                ? { backgroundColor: categoryAccentColor(catHex) }
                                : undefined;
                            const railClass = cn(
                              shortOverlapGlass
                                ? "w-[7px] min-w-[7px] shrink-0 self-stretch rounded-full my-1 ml-1 mr-px"
                                : "w-1 min-w-[4px] shrink-0 self-stretch rounded-l-[2px]",
                              !useCategoryColor &&
                                (highlighted
                                  ? tone.railSelected
                                  : shortOverlapGlass
                                    ? scheduleShortOverlapRailClass(tone)
                                    : tone.rail),
                            );
                            const hasRecurrence =
                              block.repeatRule != null &&
                              block.repeatRule !== "NONE";
                            const innerWithRail = (
                              <div
                                className={cn(
                                  "relative flex h-full min-h-0 w-full flex-row items-stretch overflow-hidden rounded-[inherit]",
                                )}
                              >
                                <div aria-hidden className={railClass} style={railStyle} />
                                <div className="flex min-h-0 min-w-0 w-full flex-1 flex-col items-start justify-start px-1.5 py-1">
                                  {innerSlot}
                                </div>
                                {hasRecurrence && (
                                  <Repeat2
                                    aria-label="重复事件"
                                    className={cn(
                                      "pointer-events-none absolute right-0.5 top-0.5 h-2.5 w-2.5 shrink-0",
                                      useCategoryColor
                                        ? "text-[#111827]/40 dark:text-white/40"
                                        : highlighted
                                          ? "text-white/60"
                                          : "text-[#111827]/35 dark:text-muted-foreground/50",
                                    )}
                                    style={
                                      useCategoryColor && catHex && !highlighted
                                        ? { color: catHex, opacity: 0.55 }
                                        : undefined
                                    }
                                  />
                                )}
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
                              : eventStackZ;
                            const positionStyle = {
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

                            if (isDraggableCalendar) {
                              const anchorAccent =
                                (useCategoryColor && catHex) ? catHex : DEFAULT_ANCHOR_ACCENT;
                              return (
                                <div
                                  key={key}
                                  ref={(node) => {
                                    if (!block.calendarEntryId) return;
                                    if (node) {
                                      eventCardElsRef.current.set(block.calendarEntryId, node);
                                    } else {
                                      eventCardElsRef.current.delete(block.calendarEntryId);
                                    }
                                  }}
                                  data-week-calendar-drag-root
                                  data-event-id={block.calendarEntryId ?? undefined}
                                  className={cn(
                                    eventCardVisualClassName,
                                    /* Root must not clip resize hit areas that sit slightly outside the card. */
                                    "touch-none select-none overflow-visible",
                                  )}
                                  style={surfaceStyle}
                                  title={title}
                                  role="group"
                                  aria-selected={isSelectedForEdit || undefined}
                                >
                                  <div className="relative h-full min-h-0 w-full overflow-hidden rounded-[inherit]">
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
                                          selectedEventId === block.calendarEntryId,
                                        );
                                      }}
                                    >
                                      <div className="pointer-events-none h-full min-h-0 w-full overflow-hidden rounded-[inherit]">
                                        {innerWithRail}
                                      </div>
                                    </div>
                                  </div>
                                  {isSelectedForEdit ? (
                                    <>
                                      {/*
                                        Resize anchors — only while selected (same gate as move drag).
                                        White-filled circles with a thin colored ring; large hit targets.
                                      */}
                                      <button
                                        type="button"
                                        className="absolute flex h-8 w-10 cursor-ns-resize touch-none items-center justify-center rounded-full bg-transparent p-0 outline-none"
                                        style={{
                                          zIndex: Z_EVENT_RESIZE_HANDLE,
                                          top: 0,
                                          right: 0,
                                          transform: "translate(50%, -50%)",
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
                                          className="pointer-events-none block h-[11px] w-[11px] shrink-0 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.18)] dark:bg-white"
                                          style={{
                                            border: `1.5px solid ${anchorAccent}`,
                                          }}
                                          aria-hidden
                                        />
                                      </button>
                                      <button
                                        type="button"
                                        className="absolute flex h-8 w-10 cursor-ns-resize touch-none items-center justify-center rounded-full bg-transparent p-0 outline-none"
                                        style={{
                                          zIndex: Z_EVENT_RESIZE_HANDLE,
                                          bottom: 0,
                                          left: 0,
                                          transform: "translate(-50%, 50%)",
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
                                          className="pointer-events-none block h-[11px] w-[11px] shrink-0 rounded-full bg-white shadow-[0_1px_2px_rgba(15,23,42,0.18)] dark:bg-white"
                                          style={{
                                            border: `1.5px solid ${anchorAccent}`,
                                          }}
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
                                  className="z-[1] absolute inset-0 overflow-hidden cursor-default rounded-[inherit] border-0 bg-transparent p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:focus-visible:ring-blue-400/40"
                                  onPointerDown={(e) => {
                                    if (block.courseId === "__draft-preview__") return;
                                    attachTapOpen(e, block, occurrenceDate);
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
        </div>}
      </div>
      {/*
        Floating edit toolbar (Cut / Copy / Duplicate / Delete) — portal'd to
        <body> so it can render above scroll clip ancestors and the sticky
        header band. Hidden while a drag is active so it does not lag behind a
        moving block.
      */}
      <WeekEventEditToolbar
        anchorEl={selectedAnchorEl}
        labels={resolvedToolbarLabels}
        onCut={() => void handleCutSelection()}
        onCopy={() => void handleCopySelection()}
        onDuplicate={() => void handleDuplicateSelection()}
        onDelete={() => void handleDeleteSelection()}
        onDismiss={dismissSelection}
      />
    </div>
  );
}
