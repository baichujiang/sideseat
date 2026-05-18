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
  /** Fill the parent flex column (share page shell); calendar scrolls inside the card. */
  fillParent = false,
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
  fillParent?: boolean;
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
    <div
      className={cn(
        fillParent ? "flex min-h-0 flex-1 flex-col gap-1 overflow-hidden" : "space-y-3",
      )}
    >
      <header className={cn("shrink-0 space-y-1 px-0.5", fillParent && "pt-0.5")}>
        <h1
          className={cn(
            "font-semibold leading-snug text-foreground",
            fillParent ? "text-center text-[15px]" : "text-[17px]",
          )}
        >
          {pageHeadline}
        </h1>
        <p
          className={cn(
            "text-muted-foreground",
            fillParent ? "text-center text-[12px] leading-snug" : "text-[13px]",
          )}
        >
          {rangeDetail}
        </p>
      </header>

      {allowGuestProposals && labels.proposePickHint ? (
        <p className="shrink-0 px-0.5 text-[11px] leading-snug text-muted-foreground">{labels.proposePickHint}</p>
      ) : null}

      {singleWeekShare ? (
        <p className="shrink-0 px-0.5 text-center text-[13px] font-medium text-foreground">{weekLabel}</p>
      ) : (
        <div className="flex shrink-0 items-center justify-between gap-2 px-0.5">
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

      <div
        className={cn(
          "min-h-0 touch-none overscroll-contain",
          fillParent && "flex min-h-0 flex-1 flex-col",
        )}
      >
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
          fillParent={fillParent}
          maxViewportBodyPx={fillParent ? undefined : 520}
          showTimeColumnLabel={false}
          createEventMode={allowGuestProposals ? "tap-slot" : undefined}
          onCreateEvent={allowGuestProposals ? handleCreateEvent : undefined}
          onDraftPreviewTimesChange={allowGuestProposals ? handleDraftPreviewTimesChange : undefined}
          onOpenItem={allowGuestProposals ? handleOpenCalendarItem : undefined}
        />
      </div>
    </div>
  );
}
