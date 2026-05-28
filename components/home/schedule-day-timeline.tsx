"use client";
import type { CalendarRepeatRule, PlanType } from "@prisma/client";
import { addMinutes } from "date-fns";
import { BookOpen, CalendarClock, MapPin } from "lucide-react";
import { useEffect, useRef } from "react";

import {
  categoryAccentColor,
  categoryBlockSurfaceStyle,
} from "@/lib/calendar/category-visual";
import {
  computeEventOverlapLayout,
  SCHEDULE_SHORT_OVERLAP_GLASS,
} from "@/lib/calendar/event-overlap-layout";
import {
  SCHEDULE_EVENT_CARD_RADIUS,
  SCHEDULE_EVENT_GRID_INNER_PAD,
  SCHEDULE_EVENT_GRID_TIME_CLASS,
  SCHEDULE_EVENT_GRID_TITLE_SIZE,
  SCHEDULE_EVENT_TONE_STYLES,
  scheduleEventGridTitleLayoutClass,
  scheduleEventRailClass,
  scheduleVisualToneKey,
} from "@/lib/schedule-event-card-tone";
import { isLongOrAllDayTimedMinutes } from "@/lib/calendar/long-calendar-block";
import { deferAfterTapClick } from "@/lib/ui/suppress-ghost-click";
import { cn } from "@/lib/utils";

import type { ScheduleSlotActionPrompt } from "@/components/calendar/week-event-edit-toolbar";

const TIMELINE_LONG_PRESS_MS = 450;
const TIMELINE_POINTER_SLOP_PX = 14;

function attachTimelineTapOrLongPress(
  e: React.PointerEvent,
  onTap: () => void,
  onLongPress: () => void,
) {
  if (e.pointerType === "mouse" && e.button !== 0) return;
  e.stopPropagation();
  const pointerId = e.pointerId;
  const x0 = e.clientX;
  const y0 = e.clientY;
  let longPressFired = false;
  let timer: number | null = window.setTimeout(() => {
    timer = null;
    longPressFired = true;
    onLongPress();
  }, TIMELINE_LONG_PRESS_MS);

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
    if (Math.hypot(ev.clientX - x0, ev.clientY - y0) > TIMELINE_POINTER_SLOP_PX) {
      clearTimer();
      detach();
    }
  };

  const onUp = (ev: PointerEvent) => {
    if (ev.pointerId !== pointerId) return;
    clearTimer();
    detach();
    if (!longPressFired) {
      deferAfterTapClick(onTap);
    }
  };

  document.addEventListener("pointermove", onMove);
  document.addEventListener("pointerup", onUp);
  document.addEventListener("pointercancel", onUp);
}

/**
 * A single item on a day timeline. Same shape as the old list view so the
 * parent can feed it either renderer without rebuilding the data.
 */
export type DayTimelineItem = {
  id: string;
  kind: "class" | "study";
  source: "course" | "calendar";
  startMinute: number;
  endMinute: number;
  title: string;
  location: string | null;
  withLabel?: string | null;
  note?: string | null;
  repeatLabel?: string | null;
  repeatRule?: CalendarRepeatRule;
  repeatUntilISO?: string | null;
  eventParticipants?: Array<{ userId: string | null; name: string }>;
  eventType?: PlanType | null;
  courseId?: string | null;
  /** Enrolled class: official course code (e.g. IN0001) for two-line card layout. */
  courseCode?: string | null;
  /** Enrolled course grid chip (two letters / code prefix). */
  courseShortLabel?: string;
  /** Class schedule: plain course name (title may still be "code · name" for search). */
  courseName?: string | null;
  categoryId?: string | null;
  categoryName?: string | null;
  categoryColor?: string | null;
  discoverActivityId?: string | null;
};

function isAllDayStyleTimelineItem(item: DayTimelineItem): boolean {
  return (
    item.kind === "study" &&
    item.source === "calendar" &&
    isLongOrAllDayTimedMinutes(item.startMinute, item.endMinute)
  );
}

const MINUTE_PX = 0.72;
const VISUAL_PADDING_TOP_MINUTES = 30;
const VISUAL_PADDING_BOTTOM_MINUTES = 12;
const FULL_DAY_MINUTES = 24 * 60;
/** Initial scroll window: 08:00–20:00 (content spans −0:30…24:12 for axis label clearance). */
const DEFAULT_VIEW_START = 8 * 60;
const DEFAULT_VIEW_END = 20 * 60;
const TIME_COL_PX = 60;

/**
 * Day-view timeline. A single-column version of the week grid: hour axis on
 * the left, events positioned and sized proportionally on the right. This
 * is strictly better than the list form for two things the list can't do:
 *
 *   1. Show gaps between events ("where am I free?"). Empty ~4-hour stretches
 *      are visible at a glance.
 *   2. Handle "empty day" gracefully — even with no events, the axis gives
 *      the eye a structure, and the now-line tells you where "right now"
 *      sits in the emptiness.
 *
 * Tradeoff: it's taller than a list. We mitigate with a compact pixel/min
 * ratio (0.9) and auto-fit to the content envelope ±hour padding.
 */
export function ScheduleDayTimeline({
  items,
  isToday,
  nowMinute,
  date,
  onCreateEvent,
  onSlotActionPrompt,
  onLongPressItem,
}: {
  items: DayTimelineItem[];
  /** Whether the day being viewed is "today" — gates now-line + state styling. */
  isToday: boolean;
  nowMinute: number;
  date: Date;
  onCreateEvent?: (start: Date, end: Date) => void;
  /** Long-press empty slot → menu (New event / Paste). Falls back to `onCreateEvent`. */
  onSlotActionPrompt?: (args: ScheduleSlotActionPrompt) => void;
  /** Long-press (~450ms): calendar → edit sheet from parent; course → detail. Tap selects only. */
  onLongPressItem?: (item: DayTimelineItem, anchorEl?: HTMLElement | null) => void;
}) {
  const holdTimerRef = useRef<number | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const visualStartMinute = -VISUAL_PADDING_TOP_MINUTES;
  const visualEndMinute = FULL_DAY_MINUTES + VISUAL_PADDING_BOTTOM_MINUTES;
  const totalMinutes = visualEndMinute - visualStartMinute;

  const hourLabels: number[] = [];
  for (let m = 0; m <= FULL_DAY_MINUTES; m += 60) hourLabels.push(m);

  const fullHeight = totalMinutes * MINUTE_PX;
  const viewportHeight =
    (DEFAULT_VIEW_END -
      DEFAULT_VIEW_START +
      VISUAL_PADDING_TOP_MINUTES +
      VISUAL_PADDING_BOTTOM_MINUTES) *
    MINUTE_PX;

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTop =
      (DEFAULT_VIEW_START - VISUAL_PADDING_TOP_MINUTES - visualStartMinute) * MINUTE_PX;
  }, [date, visualStartMinute]);

  const hasNowLine =
    isToday && nowMinute >= 0 && nowMinute <= FULL_DAY_MINUTES;

  const allDayItems = items.filter(isAllDayStyleTimelineItem);
  const timedItems = items.filter((i) => !isAllDayStyleTimelineItem(i));

  function clearHoldTimer() {
    if (holdTimerRef.current !== null) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }

  function startMouseHold(clientX: number, clientY: number, rect: DOMRect) {
    if (!onSlotActionPrompt && !onCreateEvent) return;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      createFromPointer(clientY, rect);
      holdTimerRef.current = null;
    }, 380);
  }

  function createFromPointer(clientY: number, rect: DOMRect) {
    if (!onSlotActionPrompt && !onCreateEvent) return;
    const y = clientY - rect.top;
    const rawMinute = visualStartMinute + (y / rect.height) * totalMinutes;
    const startMinute = Math.max(
      0,
      Math.min(FULL_DAY_MINUTES - 60, Math.round(rawMinute / 60) * 60),
    );
    const start = new Date(date);
    start.setHours(0, startMinute, 0, 0);
    const end = addMinutes(start, 60);
    const frac = (startMinute - visualStartMinute) / totalMinutes;
    const anchorY = rect.top + frac * rect.height;
    const clientX = rect.left + rect.width * 0.55;
    const hourPx = Math.max(28, (60 / totalMinutes) * rect.height);
    if (onSlotActionPrompt) {
      onSlotActionPrompt({
        start,
        end,
        clientX,
        clientY: anchorY,
        slotLeft: rect.left + 2,
        slotTop: anchorY,
        slotWidth: Math.max(0, rect.width - 4),
        slotHeight: Math.min(hourPx, Math.max(24, rect.bottom - anchorY)),
      });
      return;
    }
    onCreateEvent?.(start, end);
  }

  const positionedItems = computeTimelineColumns(timedItems);

  return (
    <div
      className={cn(
        "mt-0 overflow-hidden rounded-2xl border border-[#E7E0D6] bg-white p-2 shadow-[0_8px_24px_rgba(15,23,42,0.05)]",
        "dark:border-border dark:bg-card dark:shadow-[0_8px_24px_rgba(0,0,0,0.12)]",
      )}
    >
      {allDayItems.length > 0 ? (
        <div className="mb-2 flex flex-col gap-1.5 rounded-xl border border-[#F0ECE6] bg-[#FAFAF8] px-2.5 py-2 dark:border-white/[0.08] dark:bg-muted/25">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            All day
          </p>
          <div className="flex flex-wrap gap-1.5">
            {allDayItems.map((item) => {
              const isStudy = item.kind === "study";
              const toneKey = scheduleVisualToneKey({
                source: item.source,
                kind: isStudy ? "study" : "class",
                title: item.title,
                courseId: item.courseId ?? undefined,
              });
              const tone = SCHEDULE_EVENT_TONE_STYLES[toneKey];
              const catHex = item.categoryColor?.trim();
              const useCategory = item.source === "calendar" && Boolean(catHex);
              const allDayRailStyle =
                useCategory && catHex
                  ? { backgroundColor: categoryAccentColor(catHex) }
                  : undefined;
              const allDayRailClass = scheduleEventRailClass({
                tone,
                useToneRail: !useCategory,
              });
              return (
                <button
                  key={`${item.kind}-${item.id}`}
                  type="button"
                  onPointerDown={(e) => {
                    if (item.id === "__draft-preview__") return;
                    attachTimelineTapOrLongPress(
                      e,
                      () => onLongPressItem?.(item, e.currentTarget as HTMLElement),
                      () => onLongPressItem?.(item, e.currentTarget as HTMLElement),
                    );
                  }}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      if (item.id === "__draft-preview__") return;
                      onLongPressItem?.(item, ev.currentTarget as HTMLElement);
                    }
                  }}
                  className={cn(
                    "max-w-full overflow-hidden p-0 text-left font-semibold leading-snug transition",
                    SCHEDULE_EVENT_CARD_RADIUS,
                    "hover:brightness-[0.98] active:brightness-95",
                    !useCategory && tone.card,
                    useCategory && "border border-black/10 shadow-sm dark:border-white/10",
                  )}
                  style={
                    useCategory && catHex ? categoryBlockSurfaceStyle(catHex, false) : undefined
                  }
                >
                  <span className="flex max-w-full flex-row overflow-hidden rounded-[inherit]">
                    <span aria-hidden className={allDayRailClass} style={allDayRailStyle} />
                    <span
                      className={cn(
                        "min-w-0 flex-1 text-left font-semibold",
                        SCHEDULE_EVENT_GRID_INNER_PAD,
                        SCHEDULE_EVENT_GRID_TITLE_SIZE,
                        scheduleEventGridTitleLayoutClass(),
                      )}
                    >
                      {item.title}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      ) : null}
      <div
        ref={scrollRef}
        className="overflow-y-auto overscroll-contain"
        style={{ height: `${viewportHeight}px` }}
      >
        <>
          <div
            className="relative grid"
            style={{
              gridTemplateColumns: `${TIME_COL_PX}px minmax(0, 1fr)`,
              height: `${fullHeight}px`,
            }}
          >
          <div
            className="relative cursor-default border-r border-[#F0ECE6] bg-[#FAF9F6] dark:border-white/[0.08] dark:bg-muted/25"
          >
            {hourLabels.map((m) => {
              const hiddenByNow =
                hasNowLine && Math.abs(m - nowMinute) < 28;
              if (hiddenByNow) return null;
              const top = ((m - visualStartMinute) / totalMinutes) * 100;
              return (
                <div
                  key={m}
                  className="pointer-events-none absolute inset-x-0 -translate-y-1/2 px-1.5 text-right tabular-nums"
                  style={{ top: `${top}%` }}
                >
                  <span className="text-xs font-medium text-[#5F6B7A] dark:text-muted-foreground">
                    {m === FULL_DAY_MINUTES ? "24:00" : formatHM(m)}
                  </span>
                </div>
              );
            })}

            {hasNowLine ? (
              <div
                className="pointer-events-none absolute inset-x-0 z-20 -translate-y-1/2 px-1 text-right tabular-nums"
                style={{ top: `${((nowMinute - visualStartMinute) / totalMinutes) * 100}%` }}
              >
                <span className="inline-block rounded-full bg-[#E53935] px-2 py-0.5 text-[11px] font-semibold tabular-nums leading-none text-white shadow-sm dark:bg-red-500">
                  {formatHM(nowMinute)}
                </span>
              </div>
            ) : null}
          </div>

          <div className="relative border-l border-[#F3EFE8] bg-white/90 dark:border-white/[0.07] dark:bg-card/80">
            <button
              type="button"
              aria-label="Create event"
                onDoubleClick={(event) => {
                createFromPointer(
                  event.clientY,
                  event.currentTarget.getBoundingClientRect(),
                );
              }}
              onTouchStart={(event) => {
                if (!onSlotActionPrompt && !onCreateEvent) return;
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
                startMouseHold(
                  event.clientX,
                  event.clientY,
                  event.currentTarget.getBoundingClientRect(),
                );
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
                  className="pointer-events-none absolute left-0 right-0 border-t border-[#F0ECE6] dark:border-white/[0.08]"
                  style={{ top: `${top}%` }}
                />
              );
            })}

            {hasNowLine ? (
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

            {timedItems.length === 0 ? (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center px-4 text-center">
                <p className="rounded-full bg-muted/70 px-3 py-1 text-[11px] font-medium text-muted-foreground">
                  {allDayItems.length > 0
                    ? "No timed events — see All day above"
                    : isToday
                      ? "Nothing scheduled today"
                      : "Nothing scheduled"}
                </p>
              </div>
            ) : null}

            {positionedItems.map((item) => (
              <TimelineBlock
                key={`${item.kind}-${item.id}`}
                item={item}
                dayStart={visualStartMinute}
                totalMinutes={totalMinutes}
                columnIndex={item.columnIndex}
                columnCount={item.columnCount}
                stackDepth={item.stackDepth}
                hasShortOverlap={item.hasShortOverlap}
                isToday={isToday}
                nowMinute={nowMinute}
                onLongPress={(anchorEl) => {
                  if (item.id === "__draft-preview__") return;
                  onLongPressItem?.(item, anchorEl);
                }}
              />
            ))}
          </div>
        </div>
        <div className="h-5 shrink-0" aria-hidden />
        </>
      </div>
    </div>
  );
}

function TimelineBlock({
  item,
  dayStart,
  totalMinutes,
  columnIndex,
  columnCount,
  stackDepth,
  hasShortOverlap,
  isToday,
  nowMinute,
  onLongPress,
}: {
  item: DayTimelineItem;
  dayStart: number;
  totalMinutes: number;
  columnIndex: number;
  columnCount: number;
  stackDepth: number;
  hasShortOverlap: boolean;
  isToday: boolean;
  nowMinute: number;
  onLongPress: (anchorEl: HTMLElement) => void;
}) {
  const top = ((item.startMinute - dayStart) / totalMinutes) * 100;
  const height = ((item.endMinute - item.startMinute) / totalMinutes) * 100;

  const state: "past" | "ongoing" | "upcoming" = !isToday
    ? "upcoming"
    : item.endMinute <= nowMinute
      ? "past"
      : item.startMinute <= nowMinute
        ? "ongoing"
        : "upcoming";

  const isStudy = item.kind === "study";
  const Icon = isStudy ? CalendarClock : BookOpen;

  const toneKey = scheduleVisualToneKey({
    source: item.source,
    kind: isStudy ? "study" : "class",
    title: item.title,
  });
  const tone = SCHEDULE_EVENT_TONE_STYLES[toneKey];
  const catHex = item.categoryColor?.trim();
  const useCategoryColor = item.source === "calendar" && Boolean(catHex);
  const shortOverlapGlass = Boolean(hasShortOverlap);
  const toneClassOuter = cn(
    "pointer-events-none absolute transition z-[1] overflow-hidden",
    SCHEDULE_EVENT_CARD_RADIUS,
    !useCategoryColor &&
      (shortOverlapGlass ? SCHEDULE_SHORT_OVERLAP_GLASS : tone.card),
    useCategoryColor &&
      (shortOverlapGlass
        ? "shadow-[0_8px_22px_-10px_rgba(15,23,42,0.2)] dark:shadow-[0_8px_26px_-12px_rgba(0,0,0,0.55)]"
        : "shadow-sm"),
    state === "past" ? "opacity-55" : undefined,
    state === "ongoing"
      ? "ring-2 ring-[#E53935]/30 ring-offset-1 ring-offset-background dark:ring-red-400/35"
      : undefined,
  );

  // Minimum visual height so a 30-min block doesn't collapse into illegibility.
  // We cap at what fits instead of overflowing.
  const minHeightPct = Math.min(4, height);
  const effectiveHeight = Math.max(height, minHeightPct);
  const titleLayout = scheduleEventGridTitleLayoutClass(effectiveHeight);
  const showTimeRow = effectiveHeight > 0;
  const showLocationRow = Boolean(item.location) && effectiveHeight > 9;
  const showWithRow = Boolean(item.withLabel) && effectiveHeight > 11;

  const metaCls = cn("text-xs truncate text-[#111827]/65 dark:text-muted-foreground");

  const innerNormal = (
    <>
      {showTimeRow ? (
        <p
          className={cn(
            SCHEDULE_EVENT_GRID_TIME_CLASS,
            !useCategoryColor && tone.accentColor,
          )}
          style={useCategoryColor && catHex ? { color: categoryAccentColor(catHex) } : undefined}
        >
          {formatHM(item.startMinute)}
        </p>
      ) : null}
      {item.source === "course" && item.courseCode?.trim() ? (
        <div className="mt-0.5 min-w-0 space-y-0.5">
          <p
            className={cn(
              "truncate text-left font-bold tabular-nums leading-tight text-classmates-blue dark:text-blue-200",
              SCHEDULE_EVENT_GRID_TITLE_SIZE,
            )}
          >
            {item.courseCode.trim()}
          </p>
          <p
            className={cn(
              titleLayout,
              "font-bold",
              SCHEDULE_EVENT_GRID_TITLE_SIZE,
              !useCategoryColor && tone.title,
            )}
          >
            {item.courseName?.trim() || item.title}
          </p>
        </div>
      ) : (
        <div className="mt-0.5 flex min-h-0 items-start gap-1.5">
          {item.source === "course" && item.courseShortLabel ? (
            <span
              className="inline-flex h-[1.125rem] min-w-[1.35rem] shrink-0 items-center justify-center rounded-md border border-blue-700/30 bg-white px-1 text-[10px] font-bold leading-none tracking-tight text-blue-900 shadow-sm tabular-nums dark:border-blue-400/40 dark:bg-blue-950/70 dark:text-blue-100"
              title="Course tag"
            >
              {item.courseShortLabel}
            </span>
          ) : (
            <Icon
              className={cn("h-3.5 w-3.5 shrink-0", !useCategoryColor && tone.accentColor)}
              style={useCategoryColor && catHex ? { color: categoryAccentColor(catHex) } : undefined}
              strokeWidth={2.25}
            />
          )}
          <p
            className={cn(
              "min-w-0 flex-1 font-semibold",
              titleLayout,
              SCHEDULE_EVENT_GRID_TITLE_SIZE,
              !useCategoryColor && tone.title,
              useCategoryColor && (shortOverlapGlass ? "" : "text-[#111827] dark:text-foreground"),
            )}
            style={
              useCategoryColor && catHex && shortOverlapGlass
                ? { color: categoryAccentColor(catHex) }
                : undefined
            }
          >
            {item.title}
          </p>
        </div>
      )}
      {showLocationRow ? (
        <div className={cn("mt-1 flex items-start gap-1", metaCls)}>
          <MapPin className="mt-0.5 h-3 w-3 shrink-0 opacity-80" strokeWidth={2.25} />
          <span className="truncate">{item.location}</span>
        </div>
      ) : null}
      {showWithRow ? (
        <p className={cn("mt-0.5", metaCls)}>{item.withLabel}</p>
      ) : null}
    </>
  );

  const innerSlot = innerNormal;

  const columnWidth = 100 / Math.max(columnCount, 1);
  const horizontalGapPct = columnCount > 1 ? 0.8 : 0;
  const widthPct = Math.max(8, columnWidth - horizontalGapPct);
  const stackInsetPx = hasShortOverlap ? Math.min(stackDepth * 8, 18) : 0;
  const positionStyle = {
    top: `${top}%`,
    height: `${effectiveHeight}%`,
    left: `calc(${columnIndex * columnWidth}% + ${stackInsetPx}px)`,
    width: `calc(${widthPct}% - ${stackInsetPx}px)`,
    zIndex: columnIndex * 10 + stackDepth + 1,
  };
  const surfaceStyle =
    useCategoryColor && catHex
      ? {
          ...positionStyle,
          ...categoryBlockSurfaceStyle(catHex, false, {
            shortOverlap: shortOverlapGlass,
          }),
        }
      : positionStyle;
  const title = `${item.title} · ${formatHM(item.startMinute)}`;

  const railStyle =
    useCategoryColor && catHex
      ? { backgroundColor: categoryAccentColor(catHex) }
      : undefined;
  const railClass = scheduleEventRailClass({
    shortOverlapGlass,
    tone,
    useToneRail: !useCategoryColor,
  });

  return (
    <div className={toneClassOuter} style={surfaceStyle}>
      <button
        type="button"
        className="z-[1] rounded-[inherit] bg-transparent p-0 text-left transition hover:brightness-[0.98] active:brightness-95 pointer-events-auto absolute inset-0 overflow-hidden"
        title={title}
        onPointerDown={(e) => {
          if (item.id === "__draft-preview__") return;
          attachTimelineTapOrLongPress(
            e,
            () => onLongPress(e.currentTarget as HTMLElement),
            () => onLongPress(e.currentTarget as HTMLElement),
          );
        }}
        onKeyDown={(ev) => {
          if (ev.key === "Enter" || ev.key === " ") {
            ev.preventDefault();
            if (item.id === "__draft-preview__") return;
            onLongPress(ev.currentTarget as HTMLElement);
          }
        }}
      >
        <div className="flex w-full h-full min-h-0 flex-row overflow-hidden rounded-[inherit]">

          <div aria-hidden className={railClass} style={railStyle} />
          <div
            className={cn(
              "flex min-h-0 min-w-0 w-full flex-1 flex-col items-start justify-start",
              SCHEDULE_EVENT_GRID_INNER_PAD,
            )}
          >
            {innerSlot}
          </div>
        </div>
      </button>
    </div>
  );
}

type PositionedTimelineItem = DayTimelineItem & {
  columnIndex: number;
  columnCount: number;
  stackDepth: number;
  hasShortOverlap: boolean;
};

function computeTimelineColumns(items: DayTimelineItem[]): PositionedTimelineItem[] {
  return computeEventOverlapLayout(items);
}

function formatHM(minutes: number): string {
  const h = Math.floor(minutes / 60).toString().padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}
