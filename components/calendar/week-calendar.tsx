"use client";

import type { CalendarRepeatRule, PlanType, Weekday } from "@prisma/client";
import { addDays, addMinutes, format, isSameDay, startOfDay } from "date-fns";
import { MapPin, Repeat2 } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import {
  WeekEventEditToolbar,
  type ScheduleSlotActionPrompt,
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
  type EventOverlapLayout,
  SCHEDULE_SHORT_OVERLAP_GLASS,
} from "@/lib/calendar/event-overlap-layout";
import {
  buildClipboardSessionFromBlock,
  writeCalendarClipboardSession,
} from "@/lib/calendar/calendar-clipboard";
import { calendarTodayChrome } from "@/lib/calendar/today-chrome";
import { isDraftPreviewCourseId } from "@/lib/calendar/draft-preview-block";
import {
  blockMatchesDayColumn,
  buildBlocksByDateKey,
  buildWeekCalendarDayColumns,
  horizontalScrollIndexForFocus,
  horizontalScrollLeftToRevealDay,
  snapWeekCalendarHorizontalScrollLeft,
  weekCalendarHorizontalModeForFocus,
  type WeekCalendarDayColumn,
} from "@/lib/calendar/week-calendar-day-columns";
import {
  buildInitialVirtualStrip,
  canExtendVirtualStripLeft,
  canExtendVirtualStripRight,
  extendVirtualStripLeft,
  extendVirtualStripRight,
  focusInVirtualStrip,
  virtualStripDayCount,
  type VirtualStripBounds,
  type VirtualStripScrollAdjust,
} from "@/lib/calendar/week-calendar-virtual-strip";
import { berlinClockMinutes, scheduleDateKeyInBerlin } from "@/lib/calendar/schedule-berlin";
import {
  buildShareSelectionChromeByDateKey,
  buildShareSelectionRuns,
  shareSelectionColumnDividerClass,
  shareSelectionDayPillClass,
  shareSelectionHeaderCellClass,
  shareSelectionColumnToneClass,
  shareRecipientDimColumnClass,
  shareRecipientDimDayPillClass,
  shareRecipientDimHeaderCellClass,
  shareRecipientDimWeekdayLabelClass,
  shareRecipientExcludedBodyOverlayClass,
  shareSelectionRunOverlayClass,
  shareSelectionRunOverlayLayerInsetClass,
  shareSelectionWeekdayLabelClass,
  shareSelectionChromeTokens,
  type ShareSelectionChrome,
  type ShareSelectionRun,
  type ShareSelectionZone,
} from "@/lib/calendar/week-calendar-share-selection-chrome";
import {
  clampWeekCalendarMinuteScale,
  clampWeekCalendarVisibleDayCount,
  fitWeekCalendarDayColumnWidth,
  WEEK_CALENDAR_MINUTE_SCALE_DEFAULT,
  WEEK_CALENDAR_MINUTE_SCALE_MAX,
  WEEK_CALENDAR_MINUTE_SCALE_MIN,
  WEEK_CALENDAR_VISIBLE_DAY_MAX,
  WEEK_CALENDAR_VISIBLE_DAY_MIN,
  WEEK_CALENDAR_VIRTUAL_EXTEND_THRESHOLD_DAYS,
} from "@/lib/calendar/week-calendar-constants";
import { cn } from "@/lib/utils";
import { deferAfterTapClick } from "@/lib/ui/suppress-ghost-click";

export {
  clampWeekCalendarMinuteScale,
  clampWeekCalendarVisibleDayCount,
  WEEK_CALENDAR_MINUTE_SCALE_DEFAULT,
  WEEK_CALENDAR_MINUTE_SCALE_MAX,
  WEEK_CALENDAR_MINUTE_SCALE_MIN,
  WEEK_CALENDAR_VISIBLE_DAY_MAX,
  WEEK_CALENDAR_VISIBLE_DAY_MIN,
} from "@/lib/calendar/week-calendar-constants";

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
  eventType?: PlanType | null;
  kind?: "class" | "study";
  categoryId?: string | null;
  categoryName?: string | null;
  /** When set, block uses this color instead of tone heuristics. */
  categoryColor?: string | null;
  /** Stable id for PATCH when `source === "calendar"` (user-created events). */
  calendarEntryId?: string | null;
  /**
   * Berlin yyyy-MM-dd for one-off / dated blocks. When omitted, the block repeats on
   * every column with the same `weekday` (e.g. weekly classes).
   */
  occurrenceDateKey?: string | null;
  discoverActivityId?: string | null;
};

const DAY_ORDER: Weekday[] = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

/** Warm card chrome — outer frame + soft inner grid (not spreadsheet-heavy). */
export const WEEK_CALENDAR_CARD = cn(
  "mt-0 overflow-hidden rounded-2xl border border-[#E7E0D6] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)]",
  "dark:border-border dark:bg-card dark:shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
);
export const WEEK_GRID_LINE = "border-[#F0ECE6] dark:border-white/[0.08]";
export const WEEK_COL_DIVIDER = "border-[#F3EFE8] dark:border-white/[0.07]";

/** Past-midnight axis padding — keep smaller than top so scrolling past 24:00 does not leave a tall dead band. */
const VISUAL_PADDING_TOP_MINUTES = 30;
const VISUAL_PADDING_BOTTOM_MINUTES = 12;
const FULL_DAY_MINUTES = 24 * 60;
/** Sticky week header band height — used by consumers that cap the scroll viewport to the shell. */
export const WEEK_CALENDAR_HEADER_HEIGHT_PX = 32;

/** Absolute overlay so share-selection borders do not add extra grid rows. */
function ShareSelectionRunOverlayLayer({
  runs,
  zone,
  gridTemplateColumns,
  className,
}: {
  runs: readonly ShareSelectionRun[];
  zone: ShareSelectionZone;
  gridTemplateColumns: string;
  className?: string;
}) {
  if (runs.length === 0) return null;
  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none absolute z-20 grid",
        shareSelectionRunOverlayLayerInsetClass(zone),
        className,
      )}
      style={{ gridTemplateColumns }}
    >
      {runs.map((run) => (
        <div
          key={`share-run-${zone}-${run.startIndex}-${run.count}`}
          className={cn(shareSelectionRunOverlayClass(zone), "h-full min-h-0")}
          style={{
            gridColumn: `${run.startIndex + 1} / span ${run.count}`,
          }}
        />
      ))}
    </div>
  );
}

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
/** Empty-grid drag-to-create: arm after this much movement (px). */
const CREATE_DRAG_SLOP_PX = 8;
/** Hold still on a calendar card body, then drag (same 450ms idea as the mini workweek course grid). */
const CALENDAR_MOVE_LONG_PRESS_MS = 450;
const SNAP_MINUTES = 15;
const TAP_SLOT_SNAP_MINUTES = 30;
const MIN_EVENT_MINUTES = 15;
/** After this many px of movement, lock 2D scroll to horizontal OR vertical for the rest of the gesture. */
const AXIS_LOCK_THRESHOLD_PX = 24;

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

/** Timed week-grid event titles: up to two lines, word wrap, tight leading. */
function scheduleEventTitleLayoutClass(): string {
  return "line-clamp-2 min-w-0 whitespace-normal break-words leading-tight [overflow-wrap:anywhere] text-left";
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
  /** Live range while dragging on empty grid (null clears preview). */
  onCreateRangePreview,
  /** Move / resize in-grid draft preview (`__draft-preview__` blocks). */
  onDraftPreviewTimesChange,
  onOpenItem,
  onPatchCalendarEventTimes,
  onDeleteCalendarEvent,
  onDuplicateCalendarEvent,
  onCopyCalendarEvent,
  onSlotActionPrompt,
  editToolbarLabels,
  density = "default",
  minuteScale = WEEK_CALENDAR_MINUTE_SCALE_DEFAULT,
  onMinuteScaleChange,
  visibleDayCount,
  /** When set (e.g. fullscreen), overrides the scroll viewport height in px. */
  viewportBodyPx,
  /**
   * When set (e.g. Home shell), caps the scroll viewport body height so the card
   * never grows past the visible viewport — inner grid scrolls instead.
   */
  maxViewportBodyPx,
  /**
   * How empty grid cells create events: Home uses drag-to-select; course / share
   * proposal pickers use a single tap with a fixed default duration.
   */
  createEventMode = "drag",
  /** Length for `createEventMode="tap-slot"` (default 90, same as course mini grid). */
  defaultTapSlotDurationMinutes = 90,
  /** Remove outer top margin — use inside a flex fill container. */
  fillParent = false,
  /**
   * When the week grid sits inside a parent `rotate(90deg)` (portrait phone → logical landscape),
   * screen-space touch deltas must be rotated to match the un-transformed scroll box, or axis-lock
   * picks the wrong axis and vertical time scroll feels broken.
   */
  touchGestureRotateCw90 = false,
  /** Home week view hides the visible “Time” corner label; layout cell is kept. */
  showTimeColumnLabel = true,
  /**
   * `week`: Mon–Sun for `weekStartDate` only. `continuous`: long horizontal day strip
   * centered on `focusDate` (free swipe; toolbar still jumps whole weeks via `focusDate`).
   */
  horizontalScrollMode = "week",
  /** Clamp continuous strip ends (e.g. schedule share range). */
  scrollRangeStart,
  scrollRangeEnd,
  columnDateKeys,
  highlightedDateKeys,
  shareExcludedDayLabel,
  onDayHeaderSelect,
  dayHeaderSelectAria,
  /** Increment (e.g. Home “Today”) to scroll `focusDate` into view even when the date did not change. */
  revealDateNonce = 0,
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
  onCreateRangePreview?: (range: { start: Date; end: Date } | null) => void;
  onDraftPreviewTimesChange?: (range: { start: Date; end: Date }) => void;
  /** Open edit/detail from parent — timed events: compact popover beside the card; all-day: row tap. */
  onOpenItem?: (
    item: WeekCalendarBlock,
    occurrenceDate: Date,
    anchorEl: HTMLElement | null,
  ) => void;
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
  /**
   * After long-press on an empty slot, show a menu (New event / Paste) instead of
   * opening the create form immediately. When omitted, falls back to `onCreateEvent`.
   */
  onSlotActionPrompt?: (args: ScheduleSlotActionPrompt) => void;
  /** Localized labels for the floating edit toolbar. When omitted, English defaults are used. */
  editToolbarLabels?: WeekEventEditToolbarLabels;
  density?: WeekCalendarDensity;
  minuteScale?: number;
  onMinuteScaleChange?: (nextScale: number) => void;
  visibleDayCount?: number;
  viewportBodyPx?: number;
  maxViewportBodyPx?: number;
  createEventMode?: "drag" | "tap-slot";
  defaultTapSlotDurationMinutes?: number;
  fillParent?: boolean;
  touchGestureRotateCw90?: boolean;
  showTimeColumnLabel?: boolean;
  horizontalScrollMode?: "week" | "continuous";
  scrollRangeStart?: Date;
  scrollRangeEnd?: Date;
  columnDateKeys?: readonly string[];
  highlightedDateKeys?: ReadonlySet<string>;
  /** Shown on recipient share days outside `highlightedDateKeys` (e.g. “Not shared”). */
  shareExcludedDayLabel?: string;
  onDayHeaderSelect?: (date: Date) => void;
  dayHeaderSelectAria?: string;
  revealDateNonce?: number;
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
  /** Share settings: tap day headers to toggle which days are shared. */
  const dayColumnSelectMode = Boolean(onDayHeaderSelect) && !onCreateEvent && !onOpenItem;
  /** Recipient view: dim days outside `highlightedDateKeys` without header toggles. */
  const shareRecipientDimMode = Boolean(highlightedDateKeys?.size) && !onDayHeaderSelect;

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

  const calendarFrameRef = useRef<HTMLDivElement | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const horizontalScrollLayoutKeyRef = useRef<string | null>(null);
  const horizontalScrollWeekStartKeyRef = useRef<string | null>(null);
  const horizontalScrollFrameReadyRef = useRef(false);
  const dayColumnWidthForScrollRef = useRef(0);
  const prevRevealNonceRef = useRef(revealDateNonce);
  const prevVisibleWeekDaysRef = useRef<number | null>(null);
  const virtualScrollEnabled =
    horizontalScrollMode === "continuous" && !(columnDateKeys?.length ?? 0);
  const [virtualStripBounds, setVirtualStripBounds] = useState<VirtualStripBounds | null>(() =>
    virtualScrollEnabled
      ? buildInitialVirtualStrip(focusDate, scrollRangeStart, scrollRangeEnd)
      : null,
  );
  const virtualStripBoundsRef = useRef(virtualStripBounds);
  virtualStripBoundsRef.current = virtualStripBounds;
  const pendingVirtualScrollAdjustRef = useRef<VirtualStripScrollAdjust | null>(null);
  const virtualEdgeExtendLockRef = useRef<"none" | "left" | "right">("none");
  const [frameWidth, setFrameWidth] = useState(0);
  const previousMinutePxRef = useRef(MINUTE_PX);
  const minutePxRef = useRef(MINUTE_PX);
  const minuteScaleRef = useRef(resolvedMinuteScale);
  const onMinuteScaleChangeRef = useRef(onMinuteScaleChange);
  const minuteScaleAnchorRef = useRef<{ minute: number; offsetY: number } | null>(null);
  const revealScrollContextRef = useRef<{
    todayBerlinKey: string | null;
    nowMinute: number | undefined;
    visualStartMinute: number;
    defaultViewStart: number;
    minutePx: number;
  }>({
    todayBerlinKey: null,
    nowMinute: undefined,
    visualStartMinute: -VISUAL_PADDING_TOP_MINUTES,
    defaultViewStart: 8 * 60,
    minutePx: 0.72,
  });

  /**
   * Currently selected calendar entry. Long-press on an event body selects it
   * and shows the edit toolbar + resize anchors; move/resize drag is only
   * allowed while selected. Single tap opens the detail sheet.
   */
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  /** Per-eventId DOM node ref so the toolbar can anchor to the visible block. */
  const eventCardElsRef = useRef<Map<string, HTMLDivElement | null>>(new Map());

  const notifyOpenItem = useCallback(
    (block: WeekCalendarBlock, occurrenceDate: Date, anchorEl?: HTMLElement | null) => {
      const fromRef =
        block.calendarEntryId != null
          ? eventCardElsRef.current.get(block.calendarEntryId)
          : undefined;
      onOpenItem?.(block, occurrenceDate, fromRef ?? anchorEl ?? null);
    },
    [onOpenItem],
  );

  const [dragOverride, setDragOverride] = useState<{
    eventId: string;
    weekday: Weekday;
    dateKey: string;
    startMinute: number;
    endMinute: number;
  } | null>(null);
  const dayBodyElRef = useRef<Map<string, HTMLDivElement | null>>(new Map());
  /** After PATCH success, keep `dragOverride` until `blocks` reflect new times (avoids one frame of old position). */
  const pendingDragClearRef = useRef<{
    eventId: string;
    weekday: Weekday;
    dateKey: string;
    startMinute: number;
    endMinute: number;
  } | null>(null);
  const dragClearFallbackTimerRef = useRef<number | null>(null);

  /** Momentum animation handle for touch-scroll inertia. */
  const momentumRafRef = useRef<number | null>(null);
  /** Horizontal day-column snap animation after scroll release. */
  const snapAnimRafRef = useRef<number | null>(null);
  /** Release an in-progress calendar touch-scroll when an event drag takes over. */
  const releaseCalendarTouchScrollRef = useRef<(() => void) | null>(null);

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
      const dragKey = b.calendarEntryId ?? (isDraftPreviewCourseId(b.courseId) ? b.courseId : null);
      if (dragKey && dragKey === dragOverride.eventId) {
        return {
          ...b,
          weekday: dragOverride.weekday,
          occurrenceDateKey: dragOverride.dateKey,
          startMinute: dragOverride.startMinute,
          endMinute: dragOverride.endMinute,
        };
      }
      return b;
    });
  }, [blocks, dragOverride]);

  const dayColumns = useMemo(
    () =>
      buildWeekCalendarDayColumns({
        mode: horizontalScrollMode,
        weekStartDate,
        focusDate,
        scrollRangeStart,
        scrollRangeEnd,
        columnDateKeys,
        continuousStripStart:
          virtualScrollEnabled && virtualStripBounds ? virtualStripBounds.start : undefined,
        continuousStripEnd:
          virtualScrollEnabled && virtualStripBounds ? virtualStripBounds.end : undefined,
      }),
    [
      horizontalScrollMode,
      weekStartDate,
      focusDate,
      scrollRangeStart,
      scrollRangeEnd,
      columnDateKeys,
      virtualScrollEnabled,
      virtualStripBounds,
    ],
  );
  const weekStartBerlinKey = scheduleDateKeyInBerlin(weekStartDate);
  const focusBerlinKey = scheduleDateKeyInBerlin(focusDate);
  const shareSelectionChromeByKey = useMemo(
    () =>
      dayColumnSelectMode
        ? buildShareSelectionChromeByDateKey(dayColumns, highlightedDateKeys)
        : new Map<string, ShareSelectionChrome>(),
    [dayColumnSelectMode, dayColumns, highlightedDateKeys],
  );
  const shareSelectionRuns = useMemo(
    () =>
      dayColumnSelectMode ? buildShareSelectionRuns(dayColumns, highlightedDateKeys) : [],
    [dayColumnSelectMode, dayColumns, highlightedDateKeys],
  );
  const todayBerlinKey = today ? scheduleDateKeyInBerlin(today) : null;
  const todayColumnIndex = todayBerlinKey
    ? dayColumns.findIndex((column) => column.dateKey === todayBerlinKey)
    : -1;
  const todayColumnInStrip = todayColumnIndex >= 0;
  const effectiveShowNowLine = showNowLine && todayColumnInStrip;
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
  const rawViewportBodyPx = viewportBodyPx ?? computedViewportBodyPx;
  const viewportHeightPx =
    maxViewportBodyPx != null && Number.isFinite(maxViewportBodyPx)
      ? Math.min(rawViewportBodyPx, maxViewportBodyPx)
      : rawViewportBodyPx;
  const scrollViewportHeightPx = WEEK_CALENDAR_HEADER_HEIGHT_PX + viewportHeightPx;
  /** Share/Home shells pin body height so the grid scrolls inside a bounded viewport. */
  const pinScrollViewportHeight = !fillParent || maxViewportBodyPx != null;

  // Measure the scrollport (not the outer card) so vertical scrollbars and borders
  // are included — otherwise N-day view can clip the last column on the right.
  useLayoutEffect(() => {
    const scrollNode = scrollContainerRef.current;
    const frameNode = calendarFrameRef.current;
    if (!scrollNode && !frameNode) return;

    const update = () => {
      setFrameWidth(scrollNode?.clientWidth ?? frameNode?.clientWidth ?? 0);
    };
    update();

    const observer = new ResizeObserver(update);
    if (scrollNode) observer.observe(scrollNode);
    if (frameNode) observer.observe(frameNode);
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
  }, [visualStartMinute, weekStartBerlinKey, focusBerlinKey, DEFAULT_VIEW_START, density, frameWidth]);

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

    let scrollSnapTimer: number | null = null;

    const stopSnapAnim = () => {
      if (snapAnimRafRef.current !== null) {
        cancelAnimationFrame(snapAnimRafRef.current);
        snapAnimRafRef.current = null;
      }
    };

    const snapHorizontalToNearestDay = (animated: boolean) => {
      const colWidth = dayColumnWidthForScrollRef.current;
      if (colWidth <= 0) return;
      stopSnapAnim();
      const maxL = Math.max(0, node.scrollWidth - node.clientWidth);
      const target = snapWeekCalendarHorizontalScrollLeft(node.scrollLeft, colWidth, maxL);
      if (Math.abs(target - node.scrollLeft) < 0.5) return;

      if (!animated) {
        node.scrollLeft = target;
        return;
      }

      const start = node.scrollLeft;
      const startTime = performance.now();
      const durationMs = 120;
      const step = (now: number) => {
        const t = Math.min(1, (now - startTime) / durationMs);
        const eased = 1 - (1 - t) ** 3;
        node.scrollLeft = start + (target - start) * eased;
        if (t < 1) {
          snapAnimRafRef.current = requestAnimationFrame(step);
        } else {
          snapAnimRafRef.current = null;
        }
      };
      snapAnimRafRef.current = requestAnimationFrame(step);
    };

    const scheduleHorizontalSnap = () => {
      if (tid !== null || mouseDown || momentumRafRef.current !== null || snapAnimRafRef.current !== null) {
        return;
      }
      if (scrollSnapTimer != null) cancelAnimationFrame(scrollSnapTimer);
      scrollSnapTimer = requestAnimationFrame(() => {
        scrollSnapTimer = null;
        if (tid !== null || mouseDown || momentumRafRef.current !== null) return;
        snapHorizontalToNearestDay(true);
      });
    };

    // ---- Mouse / trackpad: correct non-dominant axis via scroll events ----
    let mouseDown = false;
    let mouseOriginL = 0;
    let mouseOriginT = 0;
    let mouseLock: "free" | "h" | "v" = "free";

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      stopSnapAnim();
      if (scrollSnapTimer != null) {
        cancelAnimationFrame(scrollSnapTimer);
        scrollSnapTimer = null;
      }
      mouseDown = true;
      mouseLock = "free";
      mouseOriginL = node.scrollLeft;
      mouseOriginT = node.scrollTop;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const wasHorizontal = mouseLock === "h";
      mouseDown = false;
      mouseLock = "free";
      if (wasHorizontal) {
        snapHorizontalToNearestDay(true);
      }
    };
    const onScroll = () => {
      if (mouseDown) {
        const dx = node.scrollLeft - mouseOriginL;
        const dy = node.scrollTop - mouseOriginT;
        if (mouseLock === "free") {
          if (dx * dx + dy * dy < AXIS_LOCK_THRESHOLD_PX * AXIS_LOCK_THRESHOLD_PX) return;
          mouseLock = Math.abs(dx) > Math.abs(dy) ? "h" : "v";
        }
        if (mouseLock === "h") node.scrollTop = mouseOriginT;
        else if (mouseLock === "v") node.scrollLeft = mouseOriginL;
      } else {
        scheduleHorizontalSnap();
      }
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
      stopMomentum();
      stopSnapAnim();
      if (scrollSnapTimer != null) {
        cancelAnimationFrame(scrollSnapTimer);
        scrollSnapTimer = null;
      }
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
      // Block document scroll / rubber-band while the calendar owns this gesture.
      e.preventDefault();
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
      stopMomentum();

      if (endLock === "h") {
        snapHorizontalToNearestDay(true);
        return;
      }

      let mvy = -vy;
      const DECEL = 0.965;
      const STOP_V = 30;
      let prev = performance.now();

      const tick = () => {
        const now = performance.now();
        const s = (now - prev) / 1000;
        prev = now;
        const f = Math.pow(DECEL, s * 60);
        mvy *= f;
        if (Math.abs(mvy) < STOP_V) {
          momentumRafRef.current = null;
          return;
        }
        node.scrollTop += mvy * s;
        momentumRafRef.current = requestAnimationFrame(tick);
      };

      if (Math.abs(mvy) > STOP_V) {
        momentumRafRef.current = requestAnimationFrame(tick);
      }
    };

    node.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    node.addEventListener("scroll", onScroll, { passive: true });
    node.addEventListener("touchstart", onTouchStart, { passive: true });
    node.addEventListener("touchmove", onTouchMove, { passive: false });
    node.addEventListener("touchend", onTouchEnd, { passive: true });
    node.addEventListener("touchcancel", onTouchEnd, { passive: true });

    releaseCalendarTouchScrollRef.current = () => {
      tid = null;
      tLock = "free";
      vx = vy = 0;
      stopMomentum();
    };

    return () => {
      releaseCalendarTouchScrollRef.current = null;
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
      stopSnapAnim();
      if (scrollSnapTimer != null) {
        cancelAnimationFrame(scrollSnapTimer);
        scrollSnapTimer = null;
      }
    };
  }, [touchGestureRotateCw90, visualStartMinute]);

  const blocksByDateKey = useMemo(
    () => buildBlocksByDateKey(effectiveBlocks, dayColumns),
    [effectiveBlocks, dayColumns],
  );
  type PositionedWeekBlock = WeekCalendarBlock & { id: string } & EventOverlapLayout;

  const positionedBlocksByDateKey = useMemo(() => {
    const map = new Map<string, PositionedWeekBlock[]>();
    for (const column of dayColumns) {
      const dayBlocks = blocksByDateKey.get(column.dateKey) ?? [];
      map.set(
        column.dateKey,
        computeEventOverlapLayout(
          dayBlocks.map((block, index) => ({
            ...block,
            id: block.calendarEntryId
              ? `cal-${block.calendarEntryId}`
              : `${block.courseId}-${block.startMinute}-${block.endMinute}-${index}`,
          })),
        ),
      );
    }
    return map;
  }, [blocksByDateKey, dayColumns]);

  /** Width available for day columns in the scrollport (sticky time axis is not part of the day strip). */
  const dayStripViewportPx = Math.max(frameWidth - TIME_COLUMN_PX, 1);
  const dayColumnWidth = useMemo(
    () => fitWeekCalendarDayColumnWidth(dayStripViewportPx, VISIBLE_WEEK_DAYS),
    [dayStripViewportPx, VISIBLE_WEEK_DAYS],
  );
  const dayTrackWidth = dayColumnWidth * dayColumns.length;
  const gridTemplateColumns = `repeat(${dayColumns.length}, minmax(${dayColumnWidth}px, ${dayColumnWidth}px))`;

  const handleDayColumnSelect = useCallback(
    (date: Date) => {
      onDayHeaderSelect?.(date);
    },
    [onDayHeaderSelect],
  );

  useLayoutEffect(() => {
    if (!virtualScrollEnabled) return;
    setVirtualStripBounds((prev) => {
      if (prev && focusInVirtualStrip(focusDate, prev)) return prev;
      virtualEdgeExtendLockRef.current = "none";
      return buildInitialVirtualStrip(focusDate, scrollRangeStart, scrollRangeEnd);
    });
  }, [focusBerlinKey, focusDate, virtualScrollEnabled, scrollRangeStart, scrollRangeEnd]);

  useLayoutEffect(() => {
    const adjust = pendingVirtualScrollAdjustRef.current;
    if (!adjust || (adjust.prependDays === 0 && adjust.trimStartDays === 0)) return;
    pendingVirtualScrollAdjustRef.current = null;
    const node = scrollContainerRef.current;
    const colWidth = dayColumnWidthForScrollRef.current;
    if (!node || colWidth <= 0) return;
    node.scrollLeft += adjust.prependDays * colWidth;
    node.scrollLeft -= adjust.trimStartDays * colWidth;
  }, [virtualStripBounds]);

  useEffect(() => {
    if (!virtualScrollEnabled) return;
    const node = scrollContainerRef.current;
    if (!node) return;

    let rafId: number | null = null;

    const maybeExtendVirtualStrip = () => {
      const bounds = virtualStripBoundsRef.current;
      if (!bounds) return;
      const colWidth = dayColumnWidthForScrollRef.current;
      if (colWidth <= 0) return;

      const viewportWidth = Math.max(node.clientWidth - TIME_COLUMN_PX, 1);
      const scrollLeft = node.scrollLeft;
      const firstVisibleCol = scrollLeft / colWidth;
      const lastVisibleCol = (scrollLeft + viewportWidth) / colWidth;
      const totalCols = virtualStripDayCount(bounds);
      const threshold = WEEK_CALENDAR_VIRTUAL_EXTEND_THRESHOLD_DAYS;

      if (firstVisibleCol <= threshold) {
        if (
          virtualEdgeExtendLockRef.current !== "left" &&
          canExtendVirtualStripLeft(bounds, scrollRangeStart)
        ) {
          const before = virtualStripDayCount(bounds);
          const result = extendVirtualStripLeft(bounds, scrollRangeStart, scrollRangeEnd);
          if (
            result.scrollAdjust.prependDays > 0 ||
            virtualStripDayCount(result.bounds) !== before
          ) {
            virtualEdgeExtendLockRef.current = "left";
            pendingVirtualScrollAdjustRef.current = result.scrollAdjust;
            setVirtualStripBounds(result.bounds);
          }
        }
      } else if (firstVisibleCol > threshold + 2 && virtualEdgeExtendLockRef.current === "left") {
        virtualEdgeExtendLockRef.current = "none";
      }

      if (totalCols - lastVisibleCol <= threshold) {
        if (
          virtualEdgeExtendLockRef.current !== "right" &&
          canExtendVirtualStripRight(bounds, scrollRangeEnd)
        ) {
          const before = virtualStripDayCount(bounds);
          const result = extendVirtualStripRight(bounds, scrollRangeStart, scrollRangeEnd);
          if (
            result.scrollAdjust.trimStartDays > 0 ||
            virtualStripDayCount(result.bounds) !== before
          ) {
            virtualEdgeExtendLockRef.current = "right";
            pendingVirtualScrollAdjustRef.current = result.scrollAdjust;
            setVirtualStripBounds(result.bounds);
          }
        }
      } else if (
        totalCols - lastVisibleCol > threshold + 2 &&
        virtualEdgeExtendLockRef.current === "right"
      ) {
        virtualEdgeExtendLockRef.current = "none";
      }
    };

    const onScroll = () => {
      if (rafId != null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        maybeExtendVirtualStrip();
      });
    };

    node.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      if (rafId != null) cancelAnimationFrame(rafId);
      node.removeEventListener("scroll", onScroll);
    };
  }, [virtualScrollEnabled, scrollRangeStart, scrollRangeEnd, TIME_COLUMN_PX]);

  useLayoutEffect(() => {
    const node = scrollContainerRef.current;
    if (!node || dayColumnWidth <= 0 || dayColumns.length === 0) return;

    const focusKey = scheduleDateKeyInBerlin(focusDate);
    const weekStartKey = scheduleDateKeyInBerlin(weekStartDate);
    const layoutKey = `${focusKey}|${horizontalMode}`;
    const layoutChanged = horizontalScrollLayoutKeyRef.current !== layoutKey;
    const visibleDaysChanged =
      prevVisibleWeekDaysRef.current != null &&
      prevVisibleWeekDaysRef.current !== VISIBLE_WEEK_DAYS;
    const weekChanged =
      horizontalScrollMode === "week" &&
      horizontalScrollWeekStartKeyRef.current !== weekStartKey;
    const frameJustReady = frameWidth > 0 && !horizontalScrollFrameReadyRef.current;
    if (frameWidth > 0) horizontalScrollFrameReadyRef.current = true;
    const revealNonceBumped =
      revealDateNonce > 0 && revealDateNonce !== prevRevealNonceRef.current;
    prevRevealNonceRef.current = revealDateNonce;
    const jumpToTodayReveal =
      revealNonceBumped && todayBerlinKey != null && focusKey === todayBerlinKey;
    const prevWidth = dayColumnWidthForScrollRef.current;
    const widthChanged = prevWidth > 0 && Math.abs(prevWidth - dayColumnWidth) > 0.5;

    const commitDayScroll = (scrollLeft: number) => {
      node.scrollLeft = scrollLeft;
      horizontalScrollLayoutKeyRef.current = layoutKey;
      horizontalScrollWeekStartKeyRef.current = weekStartKey;
      dayColumnWidthForScrollRef.current = dayColumnWidth;
      prevVisibleWeekDaysRef.current = VISIBLE_WEEK_DAYS;
    };

    const shouldPreserveScrollPosition =
      (widthChanged || visibleDaysChanged) &&
      !weekChanged &&
      !frameJustReady &&
      !jumpToTodayReveal &&
      (visibleDaysChanged || !layoutChanged);

    if (shouldPreserveScrollPosition) {
      const colIndex = prevWidth > 0 ? node.scrollLeft / prevWidth : 0;
      const viewportWidth = Math.max(frameWidth - TIME_COLUMN_PX, 1);
      const maxScrollLeft = Math.max(0, dayColumnWidth * dayColumns.length - viewportWidth);
      commitDayScroll(Math.min(Math.max(0, colIndex * dayColumnWidth), maxScrollLeft));
      return;
    }

    if (!layoutChanged && !weekChanged && !frameJustReady && !revealNonceBumped) {
      dayColumnWidthForScrollRef.current = dayColumnWidth;
      prevVisibleWeekDaysRef.current = VISIBLE_WEEK_DAYS;
      return;
    }

    const modeForScroll =
      todayBerlinKey != null && focusKey === todayBerlinKey
        ? weekCalendarHorizontalModeForFocus(focusDate, VISIBLE_WEEK_DAYS)
        : horizontalMode;
    const startIndex = horizontalScrollIndexForFocus(
      dayColumns,
      focusDate,
      modeForScroll,
      VISIBLE_WEEK_DAYS,
    );
    if (!jumpToTodayReveal) {
      commitDayScroll(startIndex * dayColumnWidth);
    } else {
      horizontalScrollLayoutKeyRef.current = layoutKey;
      horizontalScrollWeekStartKeyRef.current = weekStartKey;
      dayColumnWidthForScrollRef.current = dayColumnWidth;
      prevVisibleWeekDaysRef.current = VISIBLE_WEEK_DAYS;
    }
  }, [
    anchorWeekday,
    dayColumnWidth,
    dayColumns,
    focusDate,
    frameWidth,
    horizontalMode,
    horizontalScrollMode,
    revealDateNonce,
    todayBerlinKey,
    weekStartDate,
    VISIBLE_WEEK_DAYS,
  ]);

  revealScrollContextRef.current = {
    todayBerlinKey,
    nowMinute,
    visualStartMinute,
    defaultViewStart: DEFAULT_VIEW_START,
    minutePx: MINUTE_PX,
  };

  useLayoutEffect(() => {
    if (!revealDateNonce) return;
    const node = scrollContainerRef.current;
    if (!node || dayColumnWidth <= 0 || dayColumns.length === 0) return;
    const viewportWidth = Math.max(frameWidth - TIME_COLUMN_PX, 1);
    const dateToReveal = today ?? focusDate;
    node.scrollLeft = horizontalScrollLeftToRevealDay(
      dayColumns,
      dateToReveal,
      node.scrollLeft,
      viewportWidth,
      dayColumnWidth,
    );
    horizontalScrollLayoutKeyRef.current = `${scheduleDateKeyInBerlin(focusDate)}|${horizontalMode}`;

    const ctx = revealScrollContextRef.current;
    const focusKey = scheduleDateKeyInBerlin(dateToReveal);
    const jumpToNow =
      ctx.todayBerlinKey &&
      focusKey === ctx.todayBerlinKey &&
      ctx.nowMinute !== undefined &&
      ctx.nowMinute >= 0 &&
      ctx.nowMinute <= FULL_DAY_MINUTES;

    if (jumpToNow && ctx.nowMinute !== undefined) {
      const nowMin = ctx.nowMinute;
      const visibleMinutes = node.clientHeight / ctx.minutePx;
      const anchorMinute = Math.max(
        ctx.visualStartMinute,
        nowMin - visibleMinutes * 0.35,
      );
      const scrollTop = (anchorMinute - ctx.visualStartMinute) * ctx.minutePx;
      const maxScrollTop = Math.max(0, node.scrollHeight - node.clientHeight);
      node.scrollTop = Math.max(0, Math.min(maxScrollTop, scrollTop));
    } else {
      node.scrollTop =
        (ctx.defaultViewStart - VISUAL_PADDING_TOP_MINUTES - ctx.visualStartMinute) *
        ctx.minutePx;
    }
  }, [
    revealDateNonce,
    dayColumnWidth,
    dayColumns,
    focusDate,
    today,
    horizontalMode,
    VISIBLE_WEEK_DAYS,
    frameWidth,
    TIME_COLUMN_PX,
  ]);

  function minuteFromClientYInRect(clientY: number, rect: DOMRect): number {
    const y = clientY - rect.top;
    const rawMinute = visualStartMinute + (y / rect.height) * totalMinutes;
    return snapMinute(
      Math.max(visualStartMinute, Math.min(visualStartMinute + totalMinutes - 1, rawMinute)),
    );
  }

  function createRangeFromMinutes(
    column: WeekCalendarDayColumn,
    startMinute: number,
    endMinute: number,
  ): { start: Date; end: Date } {
    let sm = Math.min(startMinute, endMinute);
    let em = Math.max(startMinute, endMinute);
    if (em - sm < MIN_EVENT_MINUTES) {
      em = Math.min(FULL_DAY_MINUTES, sm + MIN_EVENT_MINUTES);
    }
    const { startAt, endAt } = buildStartEndAt(column.date, sm, em);
    return { start: startAt, end: endAt };
  }

  function emitCreateRangePreview(
    column: WeekCalendarDayColumn,
    startMinute: number,
    endMinute: number,
  ) {
    if (!onCreateRangePreview) return;
    onCreateRangePreview(createRangeFromMinutes(column, startMinute, endMinute));
  }

  function slotMenuClientPointForStart(
    start: Date,
    fallbackX: number,
    fallbackY: number,
  ): { clientX: number; clientY: number } {
    const dateKey = scheduleDateKeyInBerlin(start);
    const el = dayBodyElRef.current.get(dateKey);
    if (!el) return { clientX: fallbackX, clientY: fallbackY };
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { clientX: fallbackX, clientY: fallbackY };
    }
    const startMinute = berlinClockMinutes(start);
    const clampedMinute = Math.max(
      visualStartMinute,
      Math.min(visualStartMinute + totalMinutes, startMinute),
    );
    const frac = (clampedMinute - visualStartMinute) / totalMinutes;
    return {
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + frac * rect.height,
    };
  }

  const promptCreateOrPaste = useCallback(
    (start: Date, end: Date, clientX: number, clientY: number) => {
      onCreateRangePreview?.(null);
      if (onSlotActionPrompt) {
        const anchor = slotMenuClientPointForStart(start, clientX, clientY);
        onSlotActionPrompt({ start, end, clientX: anchor.clientX, clientY: anchor.clientY });
        return;
      }
      onCreateEvent?.(start, end);
    },
    [onCreateEvent, onCreateRangePreview, onSlotActionPrompt, totalMinutes, visualStartMinute],
  );

  function startCreatePointerSession(
    e: React.PointerEvent,
    column: WeekCalendarDayColumn,
    rect: DOMRect,
  ) {
    if (!onCreateEvent && !onSlotActionPrompt) return;
    if (highlightedDateKeys?.size && !highlightedDateKeys.has(column.dateKey)) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.stopPropagation();

    const pointerId = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const captureEl = e.currentTarget as HTMLElement;
    let anchorMinute = minuteFromClientYInRect(y0, rect);
    let currentMinute = anchorMinute;
    /** Long-press completed — same gate as day timeline / course grid. */
    let createArmed = false;
    /** User dragged to paint a custom range after long-press. */
    let rangeDragActive = false;
    let longPressTimer: number | null = null;

    const preventScroll = (ev: TouchEvent) => {
      ev.preventDefault();
    };

    const clearLongPress = () => {
      if (longPressTimer != null) {
        window.clearTimeout(longPressTimer);
        longPressTimer = null;
      }
    };

    const detach = () => {
      clearLongPress();
      document.removeEventListener("pointermove", onDocMove);
      document.removeEventListener("pointerup", onDocUp);
      document.removeEventListener("pointercancel", onDocUp);
      document.removeEventListener("touchmove", preventScroll);
      unlockBrowserTextSelectionForCalendarDrag();
    };

    const armCreate = () => {
      createArmed = true;
      if (!onSlotActionPrompt) {
        emitCreateRangePreview(column, anchorMinute, anchorMinute + MIN_EVENT_MINUTES);
      }
    };

    longPressTimer = window.setTimeout(() => {
      longPressTimer = null;
      armCreate();
    }, CALENDAR_MOVE_LONG_PRESS_MS);

    const onDocMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      const pastSlop = Math.hypot(ev.clientX - x0, ev.clientY - y0) > CREATE_DRAG_SLOP_PX;
      if (!createArmed && pastSlop) {
        clearLongPress();
        detach();
        return;
      }
      if (!createArmed) return;
      if (!rangeDragActive && pastSlop) {
        rangeDragActive = true;
        lockBrowserTextSelectionForCalendarDrag();
        try {
          captureEl.setPointerCapture(pointerId);
        } catch {
          /* ignore */
        }
        document.addEventListener("touchmove", preventScroll, { passive: false });
      }
      if (!rangeDragActive) return;
      currentMinute = minuteFromClientYInRect(ev.clientY, rect);
      if (!onSlotActionPrompt) {
        emitCreateRangePreview(column, anchorMinute, currentMinute);
      }
    };

    const onDocUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      detach();
      try {
        captureEl.releasePointerCapture(pointerId);
      } catch {
        /* ignore */
      }

      if (!createArmed) {
        onCreateRangePreview?.(null);
        return;
      }

      if (rangeDragActive) {
        const { start, end } = createRangeFromMinutes(column, anchorMinute, currentMinute);
        onCreateRangePreview?.(null);
        promptCreateOrPaste(start, end, ev.clientX, ev.clientY);
        return;
      }

      const withinTapSlop = Math.hypot(ev.clientX - x0, ev.clientY - y0) <= CREATE_DRAG_SLOP_PX;
      if (withinTapSlop) {
        const snapped = Math.max(
          0,
          Math.min(FULL_DAY_MINUTES - 60, Math.round(anchorMinute / 60) * 60),
        );
        const start = new Date(column.date);
        start.setHours(0, snapped, 0, 0);
        const end = addMinutes(start, 60);
        onCreateRangePreview?.(null);
        promptCreateOrPaste(start, end, ev.clientX, ev.clientY);
      } else {
        onCreateRangePreview?.(null);
      }
    };

    document.addEventListener("pointermove", onDocMove);
    document.addEventListener("pointerup", onDocUp);
    document.addEventListener("pointercancel", onDocUp);
  }

  const trackWidthPx = TIME_COLUMN_PX + dayTrackWidth;

  function columnFromClientXY(clientX: number, clientY: number): WeekCalendarDayColumn | null {
    for (const column of dayColumns) {
      const el = dayBodyElRef.current.get(column.dateKey);
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        return column;
      }
    }
    return null;
  }

  /** Sub-minute precision — use while dragging; snap only on release / commit. */
  function rawMinuteFromClientYForDay(clientY: number, dateKey: string): number {
    const el = dayBodyElRef.current.get(dateKey);
    if (!el) return 12 * 60;
    const r = el.getBoundingClientRect();
    if (r.height <= 1) return 0;
    const frac = Math.max(0, Math.min(1, (clientY - r.top) / r.height));
    const raw = visualStartMinute + frac * totalMinutes;
    return Math.max(0, Math.min(FULL_DAY_MINUTES, raw));
  }

  function buildStartEndAt(columnDate: Date, startMinute: number, endMinute: number): { startAt: Date; endAt: Date } {
    const dayStart = startOfDay(columnDate);
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
    if (isDraftPreviewCourseId(block.courseId)) return;
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

    const captureEl = e.currentTarget as HTMLElement;
    const onUp = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      detach();
      if (Math.hypot(ev.clientX - x0, ev.clientY - y0) <= POINTER_SLOP_PX) {
        deferAfterTapClick(() => notifyOpenItem(block, occurrenceDate, captureEl));
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
    fromColumn: WeekCalendarDayColumn,
    occurrenceDate: Date,
    blockInteractionKey: string,
    moveFromSelected: boolean,
  ) {
    const isDraftPreview = isDraftPreviewCourseId(block.courseId);
    if (isDraftPreview) {
      if (!onDraftPreviewTimesChange) return;
    } else if (!onPatchCalendarEventTimes || !block.calendarEntryId) {
      return;
    }
    if (e.pointerType === "mouse" && e.button !== 0) return;

    const isResizeMode = mode === "resize-start" || mode === "resize-end";

    const eventId = block.calendarEntryId ?? block.courseId;
    if (dragOverride && dragOverride.eventId !== eventId) {
      pendingDragClearRef.current = null;
      clearDragClearFallbackTimer();
      setDragOverride(null);
    }
    const pointerId = e.pointerId;
    const x0 = e.clientX;
    const y0 = e.clientY;
    const captureEl = e.currentTarget as HTMLElement;

    let curColumn: WeekCalendarDayColumn = fromColumn;
    let curStart = block.startMinute;
    let curEnd = block.endMinute;
    const originDuration = Math.max(MIN_EVENT_MINUTES, block.endMinute - block.startMinute);
    const grabOffsetMove =
      mode === "move"
        ? rawMinuteFromClientYForDay(e.clientY, fromColumn.dateKey) - block.startMinute
        : 0;

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
      releaseCalendarTouchScrollRef.current?.();
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
        weekday: curColumn.weekday,
        dateKey: curColumn.dateKey,
        startMinute: curStart,
        endMinute: curEnd,
      });
    };

    const onDocMove = (ev: PointerEvent) => {
      if (ev.pointerId !== pointerId) return;
      if (!activatedForDrag) {
        const dx = ev.clientX - x0;
        const dy = ev.clientY - y0;
        const pastSlop = Math.hypot(dx, dy) > POINTER_SLOP_PX;
        if (pastSlop && Math.abs(dx) > Math.abs(dy)) {
          /* Horizontal week pan — defer to the calendar touch-scroll handler. */
          clearSelectHoldTimer();
          detach();
          return;
        }
        if (selectHoldTimer != null && pastSlop) {
          /* Moved before long-press — cancel selection arm (e.g. week pan / scroll). */
          clearSelectHoldTimer();
          detach();
          return;
        }
        if (isResizeMode && pastSlop) {
          /* Handle hit: commit to resize only — column stays fixed for the whole gesture. */
          curColumn = fromColumn;
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
        const hit = columnFromClientXY(ev.clientX, ev.clientY);
        if (hit) curColumn = hit;
      }
      /* Resize: never follow the pointer into adjacent day columns — that read as a combined move + resize. */
      const minuteDateKey = mode === "move" ? curColumn.dateKey : fromColumn.dateKey;
      const m = rawMinuteFromClientYForDay(ev.clientY, minuteDateKey);
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
      setDragOverride({
        eventId,
        weekday: curColumn.weekday,
        dateKey: curColumn.dateKey,
        startMinute: curStart,
        endMinute: curEnd,
      });
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
            /* Short tap (no drag, no long-press): open detail popover beside the card. */
            setSelectedEventId(null);
            deferAfterTapClick(() => notifyOpenItem(block, occurrenceDate, captureEl));
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
        weekday: curColumn.weekday,
        dateKey: curColumn.dateKey,
        startMinute: snapStart,
        endMinute: snapEnd,
      });

      void (async () => {
        const { startAt, endAt } = buildStartEndAt(curColumn.date, snapStart, snapEnd);
        if (endAt <= startAt) {
          pendingDragClearRef.current = null;
          clearDragClearFallbackTimer();
          setDragOverride(null);
          return;
        }
        if (isDraftPreview) {
          onDraftPreviewTimesChange?.({ start: startAt, end: endAt });
          pendingDragClearRef.current = null;
          clearDragClearFallbackTimer();
          setDragOverride(null);
          return;
        }
        const patch = onPatchCalendarEventTimes;
        if (patch && block.calendarEntryId) {
          const ok = await patch({ eventId: block.calendarEntryId, startAt, endAt });
          if (!ok) {
            pendingDragClearRef.current = null;
            clearDragClearFallbackTimer();
            setDragOverride(null);
            return;
          }
          pendingDragClearRef.current = {
            eventId: block.calendarEntryId,
            weekday: curColumn.weekday,
            dateKey: curColumn.dateKey,
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
    const key = selectedBlock.occurrenceDateKey?.trim();
    if (key) {
      const column = dayColumns.find((entry) => entry.dateKey === key);
      return column?.date ?? null;
    }
    const dayIndex = DAY_ORDER.indexOf(selectedBlock.weekday);
    if (dayIndex < 0) return null;
    return addDays(weekStartDate, dayIndex);
  }, [selectedBlock, dayColumns, weekStartDate]);

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
      ref={calendarFrameRef}
      className={cn(
        "touch-none overscroll-contain select-none [-webkit-user-select:none] [-webkit-touch-callout:none]",
        "[&_input]:touch-auto [&_textarea]:touch-auto [&_select]:touch-auto",
        fillParent
          ? cn(
              "mt-0 flex min-h-0 flex-col overflow-hidden rounded-2xl border border-[#E7E0D6] bg-white shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-border dark:bg-card dark:shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
              pinScrollViewportHeight ? "shrink-0" : "h-full flex-1",
            )
          : cn(WEEK_CALENDAR_CARD, "flex flex-col overflow-hidden"),
      )}
      style={
        fillParent && pinScrollViewportHeight
          ? { height: `${scrollViewportHeightPx}px` }
          : undefined
      }
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
        style={
          pinScrollViewportHeight ? { height: `${scrollViewportHeightPx}px` } : undefined
        }
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
                height: `${WEEK_CALENDAR_HEADER_HEIGHT_PX}px`,
                minHeight: `${WEEK_CALENDAR_HEADER_HEIGHT_PX}px`,
              }}
              aria-label={showTimeColumnLabel ? undefined : sch.timeColumnLabel}
            >
              {showTimeColumnLabel ? sch.timeColumnLabel : null}
            </div>
            <div
              className={cn(
                "relative grid cursor-default box-border bg-white dark:bg-card",
                dayColumnSelectMode && shareSelectionRuns.length > 0 ? "border-b-0" : "border-b",
                WEEK_GRID_LINE,
              )}
              style={{
                zIndex: Z_DAY_HEADER_CELL,
                width: dayTrackWidth,
                gridTemplateColumns,
                height: `${WEEK_CALENDAR_HEADER_HEIGHT_PX}px`,
                minHeight: `${WEEK_CALENDAR_HEADER_HEIGHT_PX}px`,
              }}
            >
              {dayColumns.map((column, columnIndex) => {
                const day = column.weekday;
                const date = column.date;
                const isToday = todayBerlinKey ? column.dateKey === todayBerlinKey : false;
                const isWeekend = day === "SAT" || day === "SUN";
                const isAnchor = isSameDay(date, focusDate);
                const isShareSelected = highlightedDateKeys?.has(column.dateKey) ?? false;
                const shareChrome = shareSelectionChromeByKey.get(column.dateKey);

                return (
                  <div
                    key={column.dateKey}
                    className={cn(
                      "box-border flex h-full min-h-0 items-center justify-center overflow-hidden border-l bg-white px-0.5 py-0 text-center",
                      WEEK_COL_DIVIDER,
                      columnIndex === 0 && "border-l-0",
                      "dark:bg-card",
                      isWeekend && !dayColumnSelectMode && "bg-muted/40",
                      shareRecipientDimColumnClass(shareRecipientDimMode, isShareSelected),
                      shareSelectionColumnToneClass(dayColumnSelectMode, isShareSelected),
                      shareRecipientDimHeaderCellClass(shareRecipientDimMode, isShareSelected),
                      shareSelectionHeaderCellClass(dayColumnSelectMode, isShareSelected),
                      shareSelectionColumnDividerClass(shareChrome),
                    )}
                  >
                    {(() => {
                      const weekdayClass = shareRecipientDimMode
                        ? shareRecipientDimWeekdayLabelClass({
                            isShareSelected,
                            isToday,
                            todayClass: calendarTodayChrome.weekdayLabel,
                          })
                        : shareSelectionWeekdayLabelClass({
                            selectMode: dayColumnSelectMode,
                            isToday,
                            isShareSelected,
                            isWeekend,
                            isAnchor,
                            todayClass: calendarTodayChrome.weekdayLabel,
                          });
                      const dayPillClass = shareRecipientDimMode
                        ? shareRecipientDimDayPillClass({
                            isShareSelected,
                            isToday,
                            todayClass: calendarTodayChrome.dayPill,
                          })
                        : shareSelectionDayPillClass({
                            selectMode: dayColumnSelectMode,
                            isToday,
                            isShareSelected,
                            isWeekend,
                            isAnchor,
                            todayClass: calendarTodayChrome.dayPill,
                          });
                      const dayLabel = (
                        <div
                          className={cn(
                            "relative flex max-h-full flex-col items-center justify-center gap-px rounded-lg px-1 py-0.5",
                          )}
                        >
                          <span className={cn("text-[10px] tabular-nums leading-none", weekdayClass)}>
                            {dayColWeekdayFmt.format(date)}
                          </span>
                          <span
                            className={cn(
                              "inline-flex h-[20px] min-w-0 max-w-full shrink items-center justify-center whitespace-nowrap rounded-full px-1.5 text-[10px] font-semibold leading-none",
                              dayPillClass,
                            )}
                          >
                            {dayColDayMonthFmt.format(date)}
                          </span>
                          {shareRecipientDimMode && !isShareSelected && shareExcludedDayLabel ? (
                            <span className="mt-0.5 max-w-full truncate text-[8px] font-bold uppercase tracking-wide text-neutral-600 dark:text-neutral-400">
                              {shareExcludedDayLabel}
                            </span>
                          ) : null}
                        </div>
                      );
                      if (!onDayHeaderSelect) return dayLabel;
                      return (
                        <button
                          type="button"
                          aria-label={
                            dayHeaderSelectAria
                              ? formatMessage(dayHeaderSelectAria, {
                                  when: dayColDayMonthFmt.format(date),
                                })
                              : undefined
                          }
                          aria-pressed={isShareSelected}
                          onClick={() => handleDayColumnSelect(date)}
                          className={cn(
                            "flex h-full w-full min-h-0 cursor-pointer items-center justify-center rounded-none border-0 bg-transparent p-0 outline-none",
                            shareSelectionChromeTokens.focusRing,
                          )}
                        >
                          {dayLabel}
                        </button>
                      );
                    })()}
                  </div>
                );
              })}
              <ShareSelectionRunOverlayLayer
                runs={shareSelectionRuns}
                zone="header"
                gridTemplateColumns={gridTemplateColumns}
              />
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
                className="relative grid min-w-0 bg-white dark:bg-card"
                style={{ width: dayTrackWidth, gridTemplateColumns }}
              >
                {dayColumns.map((column, columnIndex) => {
                  const day = column.weekday;
                  const occurrenceDate = column.date;
                  const isWeekend = day === "SAT" || day === "SUN";
                  const isShareSelected = highlightedDateKeys?.has(column.dateKey) ?? false;
                  const shareChrome = shareSelectionChromeByKey.get(column.dateKey);
                  const dayBlocks = allDayBlocks.filter((block) => blockMatchesDayColumn(block, column));
                  return (
                    <div
                      key={`allday-${column.dateKey}`}
                      className={cn(
                        "relative box-border flex min-h-[2.25rem] flex-col gap-1 border-l px-1 py-1",
                        WEEK_COL_DIVIDER,
                        columnIndex === 0 && "border-l-0",
                        isWeekend && !dayColumnSelectMode && "bg-[#FAF8F5] dark:bg-muted/35",
                        shareRecipientDimColumnClass(shareRecipientDimMode, isShareSelected),
                        shareSelectionColumnToneClass(dayColumnSelectMode, isShareSelected),
                        shareSelectionColumnDividerClass(shareChrome),
                      )}
                    >
                      {dayColumnSelectMode ? (
                        <button
                          type="button"
                          aria-label={
                            dayHeaderSelectAria
                              ? formatMessage(dayHeaderSelectAria, {
                                  when: dayColDayMonthFmt.format(occurrenceDate),
                                })
                              : undefined
                          }
                          aria-pressed={isShareSelected}
                          onClick={() => handleDayColumnSelect(occurrenceDate)}
                          className={cn(
                            "absolute inset-0 z-[2] cursor-pointer border-0 bg-transparent p-0 outline-none",
                            shareSelectionChromeTokens.focusRing,
                          )}
                        />
                      ) : null}
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
                          courseId: block.courseId,
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
                                  notifyOpenItem(block, occurrenceDate, ev.currentTarget as HTMLElement);
                                }
                              }}
                              className={cn(
                                "relative z-[1] w-full overflow-hidden rounded-[2px] p-0 text-left text-[10px] font-semibold leading-tight transition outline-none",
                                "hover:brightness-[0.98] active:brightness-95",
                                "focus-visible:ring-2 focus-visible:ring-[#2563EB]/35 focus-visible:ring-offset-1 focus-visible:ring-offset-background dark:focus-visible:ring-blue-400/40",
                                !useCategory && tone.card,
                                useCategory && "border border-black/10 shadow-sm dark:border-white/10",
                                dayColumnSelectMode && "pointer-events-none",
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
                <ShareSelectionRunOverlayLayer
                  runs={shareSelectionRuns}
                  zone="middle"
                  gridTemplateColumns={gridTemplateColumns}
                />
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
                      effectiveShowNowLine &&
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

                  {effectiveShowNowLine &&
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
                          "absolute right-0 top-0 inline-block -translate-y-1/2 rounded-full px-1.5 py-0.5 tabular-nums leading-none",
                          calendarTodayChrome.nowPill,
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
                    {effectiveShowNowLine &&
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
                        <div className="relative h-0 w-full -translate-y-1/2">
                          <div
                            className={cn(
                              "absolute inset-x-0 top-1/2 h-px -translate-y-1/2",
                              calendarTodayChrome.nowLineThin,
                            )}
                          />
                          {todayColumnIndex >= 0 ? (
                            <>
                              <span
                                className={cn(
                                  "absolute top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full",
                                  calendarTodayChrome.nowDot,
                                )}
                                style={{ left: `${todayColumnIndex * dayColumnWidth}px` }}
                                aria-hidden
                              />
                              <div
                                className={cn(
                                  "absolute top-1/2 h-0.5 -translate-y-1/2",
                                  calendarTodayChrome.nowLineBold,
                                )}
                                style={{
                                  left: `${todayColumnIndex * dayColumnWidth}px`,
                                  width: `${dayColumnWidth}px`,
                                }}
                              />
                            </>
                          ) : null}
                        </div>
                      </div>
                    ) : null}

                    {dayColumns.map((column, columnIndex) => {
                      const day = column.weekday;
                      const dayBlocks = positionedBlocksByDateKey.get(column.dateKey) ?? [];
                      const isAnchor = isSameDay(column.date, focusDate);
                      const isWeekend = day === "SAT" || day === "SUN";
                      const isShareSelected = highlightedDateKeys?.has(column.dateKey) ?? false;
                      const shareChrome = shareSelectionChromeByKey.get(column.dateKey);
                      const occurrenceDate = column.date;

                      const columnShareActive =
                        !highlightedDateKeys?.size || highlightedDateKeys.has(column.dateKey);

                      const createFromPointer = (clientY: number, rect: DOMRect, clientX: number) => {
                        if (!onCreateEvent || !columnShareActive) return;
                        const snappedMinute = Math.max(
                          0,
                          Math.min(
                            FULL_DAY_MINUTES - 60,
                            Math.round(minuteFromClientYInRect(clientY, rect) / 60) * 60,
                          ),
                        );
                        const start = new Date(column.date);
                        start.setHours(0, snappedMinute, 0, 0);
                        const end = addMinutes(start, 60);
                        promptCreateOrPaste(start, end, clientX, clientY);
                      };

                      const createFromTapSlot = (clientY: number, rect: DOMRect, clientX: number) => {
                        if (!onCreateEvent || !columnShareActive) return;
                        const rawMinute = minuteFromClientYInRect(clientY, rect);
                        const slotStart = Math.max(
                          0,
                          Math.min(
                            FULL_DAY_MINUTES - defaultTapSlotDurationMinutes,
                            Math.floor(rawMinute / TAP_SLOT_SNAP_MINUTES) * TAP_SLOT_SNAP_MINUTES,
                          ),
                        );
                        const { start, end } = createRangeFromMinutes(
                          column,
                          slotStart,
                          slotStart + defaultTapSlotDurationMinutes,
                        );
                        promptCreateOrPaste(start, end, clientX, clientY);
                      };

                      return (
                        <div
                          key={column.dateKey}
                          ref={(node) => {
                            dayBodyElRef.current.set(column.dateKey, node);
                          }}
                          data-weekday={day}
                          className={cn(
                            "relative border-l bg-white/90",
                            WEEK_COL_DIVIDER,
                            columnIndex === 0 && "border-l-0",
                            isWeekend && !dayColumnSelectMode
                              ? "bg-[#FAF8F5] dark:bg-muted/50"
                              : "bg-white/90 dark:bg-card/80",
                            !dayColumnSelectMode && isAnchor && !isWeekend && "bg-white dark:bg-card",
                            !dayColumnSelectMode &&
                              isAnchor &&
                              isWeekend &&
                              "bg-[#FAF8F5] dark:bg-muted/50",
                            shareRecipientDimColumnClass(shareRecipientDimMode, isShareSelected),
                            shareSelectionColumnToneClass(dayColumnSelectMode, isShareSelected),
                            shareSelectionColumnDividerClass(shareChrome),
                          )}
                        >
                          {shareRecipientDimMode && !isShareSelected ? (
                            <div
                              aria-hidden
                              className={shareRecipientExcludedBodyOverlayClass()}
                            />
                          ) : null}
                          {dayColumnSelectMode ? (
                            <button
                              type="button"
                              aria-label={
                                dayHeaderSelectAria
                                  ? formatMessage(dayHeaderSelectAria, {
                                      when: dayColDayMonthFmt.format(occurrenceDate),
                                    })
                                  : undefined
                              }
                              aria-pressed={isShareSelected}
                              onClick={() => handleDayColumnSelect(occurrenceDate)}
                              className={cn(
                            "absolute inset-0 z-[2] cursor-pointer border-0 bg-transparent p-0 outline-none",
                            shareSelectionChromeTokens.focusRing,
                          )}
                            />
                          ) : columnShareActive ? (
                            <button
                              type="button"
                              aria-label={formatMessage(sch.createEventOnDayAria, {
                                when: createEventWhenFmt.format(occurrenceDate),
                              })}
                              onDoubleClick={
                                createEventMode === "drag"
                                  ? (event) => {
                                      createFromPointer(
                                        event.clientY,
                                        event.currentTarget.getBoundingClientRect(),
                                        event.clientX,
                                      );
                                    }
                                  : undefined
                              }
                              onClick={
                                createEventMode === "tap-slot"
                                  ? (event) => {
                                      createFromTapSlot(
                                        event.clientY,
                                        event.currentTarget.getBoundingClientRect(),
                                        event.clientX,
                                      );
                                    }
                                  : undefined
                              }
                              onPointerDown={
                                createEventMode === "drag"
                                  ? (event) => {
                                      startCreatePointerSession(
                                        event,
                                        column,
                                        event.currentTarget.getBoundingClientRect(),
                                      );
                                    }
                                  : undefined
                              }
                              className="absolute inset-0 cursor-crosshair"
                              style={{ zIndex: Z_DAY_CREATE_HIT }}
                            />
                          ) : null}

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
                              courseId: block.courseId,
                            });
                            const tone = SCHEDULE_EVENT_TONE_STYLES[toneKey];
                            const isDraftNewTone = toneKey === "draftNew";
                            const key = block.id;
                            const occurrenceDate = column.date;
                            const isDraftPreviewBlock = isDraftPreviewCourseId(block.courseId);
                            const isDraftPreviewEditable =
                              isDraftPreviewBlock && Boolean(onDraftPreviewTimesChange);
                            const isDraggableCalendar =
                              Boolean(onPatchCalendarEventTimes) &&
                              block.source === "calendar" &&
                              Boolean(block.calendarEntryId) &&
                              !isDraftPreviewBlock;
                            const isEventBodyDraggable = isDraggableCalendar || isDraftPreviewEditable;
                            const draftDragKey = block.calendarEntryId ?? block.courseId;
                            const draggingThis = Boolean(
                              dragOverride?.eventId && draftDragKey === dragOverride.eventId,
                            );
                            /** Saturated fill / compact type — only while `dragOverride` is active, not toolbar selection. */
                            const highlighted = draggingThis;
                            const shortOverlapGlass = Boolean(block.hasShortOverlap && !highlighted);
                            const catHex = block.categoryColor?.trim();
                            const useCategoryColor = block.source === "calendar" && Boolean(catHex);
                            /** Toolbar + resize anchors — distinct from `draggingThis` visuals (see interaction chrome below). */
                            const isSelectedForEdit =
                              isDraggableCalendar &&
                              Boolean(block.calendarEntryId) &&
                              selectedEventId === block.calendarEntryId;
                            const showDraftResizeHandles = isDraftPreviewEditable;
                            const startMinuteShown = draggingThis
                              ? snapMinute(block.startMinute)
                              : block.startMinute;
                            const endMinuteShown = draggingThis
                              ? snapMinute(block.endMinute)
                              : block.endMinute;
                            const eventCardVisualClassName = cn(
                              "absolute rounded-[2px] p-0 text-left leading-tight transition",
                              dayColumnSelectMode && "pointer-events-none",
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
                            const titleLayout = scheduleEventTitleLayoutClass();
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
                                        "font-semibold",
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
                                      "mt-px min-w-0 font-semibold",
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
                                        "font-semibold",
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
                                      "mt-px min-w-0 font-semibold",
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
                                          notifyOpenItem(block, occurrenceDate, ev.currentTarget as HTMLElement);
                                        }
                                      }}
                                      onPointerDown={(ev) => {
                                        if (!isEventBodyDraggable) return;
                                        ev.stopPropagation();
                                        startCalendarPointerSession(
                                          ev,
                                          block,
                                          "move",
                                          column,
                                          occurrenceDate,
                                          key,
                                          isDraftPreviewEditable ||
                                            selectedEventId === block.calendarEntryId,
                                        );
                                      }}
                                    >
                                      <div className="pointer-events-none h-full min-h-0 w-full overflow-hidden rounded-[inherit]">
                                        {innerWithRail}
                                      </div>
                                    </div>
                                  </div>
                                  {isSelectedForEdit || showDraftResizeHandles ? (
                                    <>
                                      {/*
                                        Resize anchors — only while selected (same gate as move drag).
                                        White-filled circles with a thin colored ring; large hit targets.
                                      */}
                                      <button
                                        type="button"
                                        className="absolute left-1/2 top-0 flex h-8 w-10 -translate-x-1/2 -translate-y-1/2 cursor-ns-resize touch-none items-center justify-center rounded-full bg-transparent p-0 outline-none"
                                        style={{
                                          zIndex: Z_EVENT_RESIZE_HANDLE,
                                        }}
                                        aria-label={`Drag anchor to change start time: ${titleLine}`}
                                        onPointerDown={(ev) => {
                                          ev.stopPropagation();
                                          startCalendarPointerSession(
                                            ev,
                                            block,
                                            "resize-start",
                                            column,
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
                                        className="absolute bottom-0 left-1/2 flex h-8 w-10 -translate-x-1/2 translate-y-1/2 cursor-ns-resize touch-none items-center justify-center rounded-full bg-transparent p-0 outline-none"
                                        style={{
                                          zIndex: Z_EVENT_RESIZE_HANDLE,
                                        }}
                                        aria-label={`Drag anchor to change end time: ${titleLine}`}
                                        onPointerDown={(ev) => {
                                          ev.stopPropagation();
                                          startCalendarPointerSession(
                                            ev,
                                            block,
                                            "resize-end",
                                            column,
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
                                    if (isDraftPreviewCourseId(block.courseId)) return;
                                    attachTapOpen(e, block, occurrenceDate);
                                  }}
                                      onKeyDown={(ev) => {
                                        if (ev.key === "Enter" || ev.key === " ") {
                                          ev.preventDefault();
                                          if (isDraftPreviewCourseId(block.courseId)) return;
                                          notifyOpenItem(block, occurrenceDate, ev.currentTarget as HTMLElement);
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
                    <ShareSelectionRunOverlayLayer
                      runs={shareSelectionRuns}
                      zone="body"
                      gridTemplateColumns={gridTemplateColumns}
                    />
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
