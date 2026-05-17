"use client";

import { addWeeks, format, subWeeks } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useMemo, useState } from "react";

import {
  WeekCalendar,
  WEEK_CALENDAR_MINUTE_SCALE_DEFAULT,
} from "@/components/calendar/week-calendar";
import { isDraftPreviewCourseId } from "@/lib/calendar/draft-preview-block";
import { berlinClockMinutes, berlinEndOfWeek, berlinStartOfWeek } from "@/lib/calendar/schedule-berlin";
import type { PublicScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import type { ScheduleShareProposalSelection } from "@/lib/schedule-share/proposal-selection";
import {
  buildProposalSelectionFromClick,
  clampDateToShareRange,
  clampProposalEndToBounds,
  findContainingFreeSlot,
  initialShareViewDate,
  proposalSelectionToPreviewBlock,
  publicBlocksToWeekCalendarBlocks,
  shareRangeOccupiesSingleBerlinWeek,
} from "@/lib/schedule-share/public-blocks-to-week-calendar";
import { cn } from "@/lib/utils";

export function ScheduleShareViewer({
  snapshot,
  pageHeadline,
  rangeDetail,
  labels,
  allowGuestProposals = false,
  freeSlots = [],
  proposalSelection,
  onProposalSelectionChange,
  onEditProposalSelection,
}: {
  snapshot: PublicScheduleShareSnapshot;
  pageHeadline: string;
  rangeDetail: string;
  labels: {
    busyAnonymous: string;
    prevWeekAria: string;
    nextWeekAria: string;
    proposePickHint?: string;
    selectionPreview?: string;
  };
  allowGuestProposals?: boolean;
  freeSlots?: { start: string; end: string }[];
  proposalSelection?: ScheduleShareProposalSelection | null;
  onProposalSelectionChange?: (selection: ScheduleShareProposalSelection | null) => void;
  /** Short tap on the in-grid draft block — open time editor in the proposal panel. */
  onEditProposalSelection?: () => void;
}) {
  const rangeStart = useMemo(() => new Date(snapshot.rangeStart), [snapshot.rangeStart]);
  const rangeEnd = useMemo(() => new Date(snapshot.rangeEnd), [snapshot.rangeEnd]);
  const now = useMemo(() => new Date(), []);

  const [selectedDate, setSelectedDate] = useState(() => initialShareViewDate(rangeStart, rangeEnd));

  const weekStart = berlinStartOfWeek(selectedDate);
  const weekEnd = berlinEndOfWeek(selectedDate);
  const shareFirstWeek = berlinStartOfWeek(rangeStart);
  const shareLastWeek = berlinStartOfWeek(rangeEnd);
  const singleWeekShare = shareRangeOccupiesSingleBerlinWeek(rangeStart, rangeEnd);

  const canGoPrev = !singleWeekShare && weekStart.getTime() > shareFirstWeek.getTime();
  const canGoNext = !singleWeekShare && weekStart.getTime() < shareLastWeek.getTime();

  const timedBlocks = useMemo(
    () =>
      publicBlocksToWeekCalendarBlocks({
        blocks: snapshot.blocks,
        weekStart,
        busyAnonymousLabel: labels.busyAnonymous,
      }),
    [snapshot.blocks, weekStart, labels.busyAnonymous],
  );

  const blocksForCalendar = useMemo(() => {
    if (!proposalSelection || !labels.selectionPreview) return timedBlocks;
    return [...timedBlocks, proposalSelectionToPreviewBlock(proposalSelection, labels.selectionPreview)];
  }, [timedBlocks, proposalSelection, labels.selectionPreview]);

  const applyProposalRange = useCallback(
    (start: Date, end: Date) => {
      if (!allowGuestProposals || !onProposalSelectionChange) return;
      const bounds = findContainingFreeSlot(freeSlots, start, end);
      if (!bounds) return;
      const clampedEnd = clampProposalEndToBounds(start, end, bounds);
      onProposalSelectionChange({
        start,
        end: clampedEnd,
        bounds: { start: bounds.start, end: bounds.end },
      });
    },
    [allowGuestProposals, freeSlots, onProposalSelectionChange],
  );

  const handleCreateEvent = useCallback(
    (start: Date, end: Date) => {
      if (!allowGuestProposals || !onProposalSelectionChange) return;
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
    },
    [allowGuestProposals, freeSlots, onProposalSelectionChange],
  );

  const handleDraftPreviewTimesChange = useCallback(
    (range: { start: Date; end: Date }) => {
      applyProposalRange(range.start, range.end);
    },
    [applyProposalRange],
  );

  const handleOpenCalendarItem = useCallback(
    (block: { courseId: string }, _occurrenceDate: Date) => {
      if (isDraftPreviewCourseId(block.courseId)) {
        onEditProposalSelection?.();
      }
    },
    [onEditProposalSelection],
  );

  const weekLabel = `${format(weekStart, "MMM d")} – ${format(weekEnd, "MMM d, yyyy")}`;

  return (
    <div className="space-y-3">
      <header className="space-y-1.5 px-0.5">
        <h1 className="text-[17px] font-semibold leading-snug text-foreground">{pageHeadline}</h1>
        <p className="text-[13px] text-muted-foreground">{rangeDetail}</p>
      </header>

      {allowGuestProposals && labels.proposePickHint ? (
        <p className="px-0.5 text-[11px] leading-snug text-muted-foreground">{labels.proposePickHint}</p>
      ) : null}

      {singleWeekShare ? (
        <p className="px-0.5 text-center text-[13px] font-medium text-foreground">{weekLabel}</p>
      ) : (
        <div className="flex items-center justify-between gap-2 px-0.5">
          <button
            type="button"
            disabled={!canGoPrev}
            aria-label={labels.prevWeekAria}
            onClick={() => {
              const next = clampDateToShareRange(subWeeks(selectedDate, 1), rangeStart, rangeEnd);
              setSelectedDate(berlinStartOfWeek(next));
            }}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background transition",
              "disabled:opacity-40",
              "hover:bg-muted/50",
            )}
          >
            <ChevronLeft className="h-4 w-4" strokeWidth={2} />
          </button>
          <p className="min-w-0 flex-1 text-center text-[13px] font-medium text-foreground">{weekLabel}</p>
          <button
            type="button"
            disabled={!canGoNext}
            aria-label={labels.nextWeekAria}
            onClick={() => {
              const next = clampDateToShareRange(addWeeks(selectedDate, 1), rangeStart, rangeEnd);
              setSelectedDate(berlinStartOfWeek(next));
            }}
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/70 bg-background transition",
              "disabled:opacity-40",
              "hover:bg-muted/50",
            )}
          >
            <ChevronRight className="h-4 w-4" strokeWidth={2} />
          </button>
        </div>
      )}

      <WeekCalendar
        blocks={blocksForCalendar}
        horizontalMode="workweek"
        nowMinute={berlinClockMinutes(now)}
        showNowLine={weekStart <= now && now <= weekEnd}
        weekStartDate={weekStart}
        focusDate={selectedDate}
        today={now}
        visibleDayCount={7}
        minuteScale={WEEK_CALENDAR_MINUTE_SCALE_DEFAULT}
        maxViewportBodyPx={520}
        createEventMode={allowGuestProposals ? "tap-slot" : undefined}
        onCreateEvent={allowGuestProposals ? handleCreateEvent : undefined}
        onDraftPreviewTimesChange={allowGuestProposals ? handleDraftPreviewTimesChange : undefined}
        onOpenItem={allowGuestProposals ? handleOpenCalendarItem : undefined}
      />
    </div>
  );
}
