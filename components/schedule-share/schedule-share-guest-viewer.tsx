"use client";

/**
 * Recipient share calendar: view schedule and optionally pick a free slot to propose a time.
 * Owner edit UI lives in ScheduleShareOwnerPreview.
 */

import { differenceInCalendarDays, startOfDay } from "date-fns";
import { useMemo, useRef } from "react";

import { WeekCalendar, clampWeekCalendarVisibleDayCount } from "@/components/calendar/week-calendar";
import { isDraftPreviewCourseId } from "@/lib/calendar/draft-preview-block";
import { berlinClockMinutes, berlinEndOfWeek, berlinStartOfWeek } from "@/lib/calendar/schedule-berlin";
import type { PublicScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import type { ScheduleShareProposalSelection } from "@/lib/schedule-share/proposal-selection";
import {
  buildProposalSelectionFromClick,
  clampProposalEndToBounds,
  findContainingFreeSlot,
  initialShareViewDate,
  proposalSelectionToPreviewBlock,
  publicBlocksToWeekCalendarBlocks,
} from "@/lib/schedule-share/public-blocks-to-week-calendar";
import { cn } from "@/lib/utils";

import { useHomeCalendarMinuteScale } from "@/components/schedule-share/use-home-calendar-minute-scale";
import { useShareWeekCalendarMaxViewportBodyPx } from "@/components/schedule-share/use-share-week-calendar-max-body";

export function ScheduleShareGuestViewer({
  snapshot,
  pageHeadline,
  rangeDetail,
  labels,
  readOnly = false,
  allowGuestProposals = false,
  freeSlots = [],
  proposalSelection,
  onProposalSelectionChange,
  onEditProposalSelection,
  fillParent = false,
}: {
  snapshot: PublicScheduleShareSnapshot;
  pageHeadline?: string;
  rangeDetail?: string;
  labels: {
    busyAnonymous: string;
    shareExcludedDayBadge?: string;
    proposePickHint?: string;
    selectionPreview?: string;
  };
  /** Recipient view: calendar + events only, no chrome or interaction affordances. */
  readOnly?: boolean;
  allowGuestProposals?: boolean;
  freeSlots?: { start: string; end: string }[];
  proposalSelection?: ScheduleShareProposalSelection | null;
  onProposalSelectionChange?: (selection: ScheduleShareProposalSelection | null) => void;
  onEditProposalSelection?: () => void;
  fillParent?: boolean;
}) {
  const rangeStart = useMemo(() => new Date(snapshot.rangeStart), [snapshot.rangeStart]);
  const rangeEnd = useMemo(() => new Date(snapshot.rangeEnd), [snapshot.rangeEnd]);
  const now = useMemo(() => new Date(), []);

  const includedDateKeys = useMemo(() => {
    const keys = snapshot.includedDates?.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)) ?? [];
    return keys.length > 0 ? keys : null;
  }, [snapshot.includedDates]);

  const viewDate = useMemo(
    () => initialShareViewDate(rangeStart, rangeEnd),
    [rangeStart, rangeEnd],
  );

  const weekStart = berlinStartOfWeek(viewDate);
  const weekEnd = berlinEndOfWeek(viewDate);

  const rangeDayCount = useMemo(
    () => differenceInCalendarDays(startOfDay(rangeEnd), startOfDay(rangeStart)) + 1,
    [rangeStart, rangeEnd],
  );

  const sharedHighlightKeys = useMemo(
    () => (includedDateKeys ? new Set(includedDateKeys) : undefined),
    [includedDateKeys],
  );

  const visibleDayCount = useMemo(
    () => clampWeekCalendarVisibleDayCount(Math.min(7, rangeDayCount)),
    [rangeDayCount],
  );

  const interactiveProposals =
    !readOnly && allowGuestProposals && Boolean(onProposalSelectionChange);

  const includedKeySet = useMemo(
    () => (includedDateKeys ? new Set(includedDateKeys) : null),
    [includedDateKeys],
  );

  const timedBlocks = useMemo(() => {
    const blocks = publicBlocksToWeekCalendarBlocks({
      blocks: snapshot.blocks,
      rangeStart,
      rangeEnd,
      includedDateKeys: includedKeySet ?? undefined,
      busyAnonymousLabel: labels.busyAnonymous,
    });
    if (interactiveProposals && proposalSelection && labels.selectionPreview) {
      return [...blocks, proposalSelectionToPreviewBlock(proposalSelection, labels.selectionPreview)];
    }
    return blocks;
  }, [
    snapshot.blocks,
    rangeStart,
    rangeEnd,
    includedKeySet,
    labels.busyAnonymous,
    interactiveProposals,
    proposalSelection,
    labels.selectionPreview,
  ]);

  const [minuteScale, setMinuteScale] = useHomeCalendarMinuteScale();
  const calendarLayoutRef = useRef<HTMLDivElement>(null);
  const maxViewportBodyPx = useShareWeekCalendarMaxViewportBodyPx(calendarLayoutRef, {
    enabled: fillParent,
  });

  if (readOnly) {
    return (
      <div
        ref={calendarLayoutRef}
        className={cn(
          "min-h-0 overscroll-contain",
          fillParent ? "flex h-full min-h-0 flex-1 flex-col px-1 pt-[env(safe-area-inset-top)]" : "px-0.5",
        )}
      >
        <WeekCalendar
          blocks={timedBlocks}
          nowMinute={berlinClockMinutes(now)}
          showNowLine={weekStart <= now && now <= weekEnd}
          weekStartDate={weekStart}
          focusDate={viewDate}
          today={now}
          visibleDayCount={visibleDayCount}
          horizontalMode="workweek"
          horizontalScrollMode="continuous"
          scrollRangeStart={rangeStart}
          scrollRangeEnd={rangeEnd}
          highlightedDateKeys={sharedHighlightKeys}
          shareExcludedDayLabel={labels.shareExcludedDayBadge}
          minuteScale={minuteScale}
          onMinuteScaleChange={setMinuteScale}
          fillParent={fillParent}
          maxViewportBodyPx={fillParent ? maxViewportBodyPx : 520}
          showTimeColumnLabel={false}
        />
      </div>
    );
  }

  const applyProposalRange = (start: Date, end: Date) => {
    if (!interactiveProposals || !onProposalSelectionChange) return;
    const bounds = findContainingFreeSlot(freeSlots, start, end);
    if (!bounds) return;
    onProposalSelectionChange({
      start,
      end: clampProposalEndToBounds(start, end, bounds),
      bounds: { start: bounds.start, end: bounds.end },
    });
  };

  const handleCreateEvent = (start: Date, end: Date) => {
    if (!interactiveProposals || !onProposalSelectionChange) return;
    const selection = buildProposalSelectionFromClick(freeSlots, start);
    if (selection) {
      onProposalSelectionChange(selection);
      return;
    }
    const bounds = findContainingFreeSlot(freeSlots, start, end);
    if (!bounds) return;
    onProposalSelectionChange({
      start,
      end: clampProposalEndToBounds(start, end, bounds),
      bounds: { start: bounds.start, end: bounds.end },
    });
  };

  return (
    <div
      className={cn(
        fillParent ? "flex min-h-0 flex-1 flex-col gap-1 overflow-hidden" : "space-y-3",
      )}
    >
      {pageHeadline ? (
        <header className={cn("shrink-0 space-y-1 px-0.5", fillParent && "pt-0.5")}>
          <h1
            className={cn(
              "font-semibold leading-snug text-foreground",
              fillParent ? "text-center text-[15px]" : "text-[17px]",
            )}
          >
            {pageHeadline}
          </h1>
          {rangeDetail ? (
            <p
              className={cn(
                "text-muted-foreground",
                fillParent ? "text-center text-[12px] leading-snug" : "text-[13px]",
              )}
            >
              {rangeDetail}
            </p>
          ) : null}
        </header>
      ) : null}

      {labels.proposePickHint ? (
        <p className="shrink-0 px-0.5 text-[11px] leading-snug text-muted-foreground">
          {labels.proposePickHint}
        </p>
      ) : null}

      <div
        ref={calendarLayoutRef}
        className={cn(
          "min-h-0 overscroll-contain",
          fillParent && "flex min-h-0 flex-1 flex-col",
        )}
      >
        <WeekCalendar
          blocks={timedBlocks}
          nowMinute={berlinClockMinutes(now)}
          showNowLine={weekStart <= now && now <= weekEnd}
          weekStartDate={weekStart}
          focusDate={viewDate}
          today={now}
          visibleDayCount={visibleDayCount}
          horizontalMode="workweek"
          horizontalScrollMode="continuous"
          scrollRangeStart={rangeStart}
          scrollRangeEnd={rangeEnd}
          highlightedDateKeys={sharedHighlightKeys}
          shareExcludedDayLabel={labels.shareExcludedDayBadge}
          minuteScale={minuteScale}
          onMinuteScaleChange={setMinuteScale}
          fillParent={fillParent}
          maxViewportBodyPx={fillParent ? maxViewportBodyPx : 520}
          showTimeColumnLabel={false}
          createEventMode={interactiveProposals ? "tap-slot" : undefined}
          onCreateEvent={interactiveProposals ? handleCreateEvent : undefined}
          onDraftPreviewTimesChange={
            interactiveProposals
              ? (range) => applyProposalRange(range.start, range.end)
              : undefined
          }
          onOpenItem={
            interactiveProposals
              ? (block) => {
                  if (isDraftPreviewCourseId(block.courseId)) onEditProposalSelection?.();
                }
              : undefined
          }
        />
      </div>
    </div>
  );
}
