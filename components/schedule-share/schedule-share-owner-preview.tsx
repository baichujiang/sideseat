"use client";

/**
 * Owner share-settings preview only (editable range, reveal, copy link, etc. live
 * in ScheduleShareOwnerClient). Not shown to guests opening the public link.
 */

import { useMemo, useRef } from "react";

import { WeekCalendar } from "@/components/calendar/week-calendar";
import { WeekVisibleDaysBar } from "@/components/calendar/week-visible-days-bar";
import { berlinClockMinutes, berlinEndOfWeek, berlinStartOfWeek } from "@/lib/calendar/schedule-berlin";
import type { PublicScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { publicBlocksToWeekCalendarBlocks } from "@/lib/schedule-share/public-blocks-to-week-calendar";
import {
  shareOwnerCalendarPickerRange,
  type ShareDayQuickPreset,
} from "@/lib/schedule-share/share-selected-days";
import { cn } from "@/lib/utils";

import { ShareDayQuickSelectRow } from "@/components/schedule-share/share-day-quick-select-buttons";
import { useHomeCalendarMinuteScale } from "@/components/schedule-share/use-home-calendar-minute-scale";
import { useShareWeekCalendarMaxViewportBodyPx } from "@/components/schedule-share/use-share-week-calendar-max-body";

export function ScheduleShareOwnerPreview({
  snapshot,
  rangeDetail,
  busyAnonymousLabel,
  focusDate,
  visibleDayCount,
  onVisibleDayCountChange,
  selectedShareDateKeys,
  onSelectShareDay,
  dayHeaderSelectAria,
  selectedDaysCountLabel,
  onClearAllShareDays,
  clearAllShareDaysLabel,
  quickSelectPresets,
  onQuickSelectShareDays,
  fillParent = false,
}: {
  snapshot: PublicScheduleShareSnapshot;
  rangeDetail: string;
  busyAnonymousLabel: string;
  focusDate: Date;
  visibleDayCount: number;
  onVisibleDayCountChange: (next: number) => void;
  selectedShareDateKeys: ReadonlySet<string>;
  onSelectShareDay: (date: Date) => void;
  dayHeaderSelectAria: string;
  selectedDaysCountLabel: string;
  onClearAllShareDays: () => void;
  clearAllShareDaysLabel: string;
  quickSelectPresets: ReadonlyArray<{
    preset: ShareDayQuickPreset;
    title: string;
    hint: string;
  }>;
  onQuickSelectShareDays: (preset: ShareDayQuickPreset) => void;
  fillParent?: boolean;
}) {
  const selectedCount = selectedShareDateKeys.size;
  const { rangeStart, rangeEnd } = useMemo(() => shareOwnerCalendarPickerRange(), []);
  const now = useMemo(() => new Date(), []);

  const weekStart = useMemo(() => berlinStartOfWeek(focusDate), [focusDate]);
  const weekEnd = useMemo(() => berlinEndOfWeek(focusDate), [focusDate]);

  const timedBlocks = useMemo(
    () =>
      publicBlocksToWeekCalendarBlocks({
        blocks: snapshot.blocks,
        rangeStart,
        rangeEnd,
        busyAnonymousLabel,
      }),
    [snapshot.blocks, rangeStart, rangeEnd, busyAnonymousLabel],
  );

  const [minuteScale, setMinuteScale] = useHomeCalendarMinuteScale();
  const calendarLayoutRef = useRef<HTMLDivElement>(null);
  const visibleDaysBarRef = useRef<HTMLDivElement>(null);
  const maxViewportBodyPx = useShareWeekCalendarMaxViewportBodyPx(calendarLayoutRef, {
    enabled: fillParent,
    belowCalendarRef: visibleDaysBarRef,
  });

  return (
    <div
      className={cn(
        fillParent ? "flex min-h-0 flex-1 flex-col gap-1 overflow-hidden" : "space-y-3",
      )}
    >
      <div className="shrink-0 space-y-1.5 px-0.5">
        <p className="flex flex-wrap items-center justify-center gap-x-1.5 text-center text-[12px] leading-snug">
          <span className="font-semibold text-foreground">{selectedDaysCountLabel}</span>
          {rangeDetail ? (
            <>
              <span className="text-muted-foreground/60" aria-hidden>
                ·
              </span>
              <span className="font-medium text-muted-foreground">{rangeDetail}</span>
            </>
          ) : null}
        </p>
        <ShareDayQuickSelectRow
          presets={quickSelectPresets}
          onSelect={onQuickSelectShareDays}
          clearLabel={clearAllShareDaysLabel}
          onClear={onClearAllShareDays}
          clearDisabled={selectedCount === 0}
        />
      </div>

      <div
        ref={calendarLayoutRef}
        className={cn(
          "min-h-0",
          fillParent ? "flex min-h-0 flex-1 flex-col overflow-hidden" : "overscroll-contain",
        )}
      >
        <WeekCalendar
          blocks={timedBlocks}
          nowMinute={berlinClockMinutes(now)}
          showNowLine={weekStart <= now && now <= weekEnd}
          weekStartDate={weekStart}
          focusDate={focusDate}
          today={now}
          visibleDayCount={visibleDayCount}
          horizontalMode="include-anchor"
          horizontalScrollMode="continuous"
          minuteScale={minuteScale}
          onMinuteScaleChange={setMinuteScale}
          fillParent={fillParent}
          maxViewportBodyPx={maxViewportBodyPx}
          scrollRangeStart={rangeStart}
          scrollRangeEnd={rangeEnd}
          showTimeColumnLabel={false}
          highlightedDateKeys={selectedShareDateKeys}
          onDayHeaderSelect={onSelectShareDay}
          dayHeaderSelectAria={dayHeaderSelectAria}
        />
        <div ref={visibleDaysBarRef} className="shrink-0 px-0.5 pt-1">
          <WeekVisibleDaysBar value={visibleDayCount} onChange={onVisibleDayCountChange} />
        </div>
      </div>
    </div>
  );
}
