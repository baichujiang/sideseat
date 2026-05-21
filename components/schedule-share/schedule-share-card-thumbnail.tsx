"use client";

import { differenceInCalendarDays, startOfDay } from "date-fns";
import { useMemo, useRef } from "react";

import { WeekCalendar, clampWeekCalendarVisibleDayCount } from "@/components/calendar/week-calendar";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import {
  berlinClockMinutes,
  berlinEndOfWeek,
  berlinStartOfWeek,
} from "@/lib/calendar/schedule-berlin";
import type { PublicScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import {
  initialShareViewDate,
  publicBlocksToWeekCalendarBlocks,
} from "@/lib/schedule-share/public-blocks-to-week-calendar";
import { useShareWeekCalendarMaxViewportBodyPx } from "@/components/schedule-share/use-share-week-calendar-max-body";
import { cn } from "@/lib/utils";

export function ScheduleShareCardThumbnail({
  snapshot,
  className,
}: {
  snapshot: PublicScheduleShareSnapshot;
  className?: string;
}) {
  const { messages: ui } = useLocaleContext();
  const now = useMemo(() => new Date(), []);

  const rangeStart = useMemo(() => new Date(snapshot.rangeStart), [snapshot.rangeStart]);
  const rangeEnd = useMemo(() => new Date(snapshot.rangeEnd), [snapshot.rangeEnd]);

  const includedDateKeys = useMemo(() => {
    const keys = snapshot.includedDates?.filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k)) ?? [];
    return keys.length > 0 ? keys : null;
  }, [snapshot.includedDates]);

  const includedKeySet = useMemo(
    () => (includedDateKeys ? new Set(includedDateKeys) : null),
    [includedDateKeys],
  );

  const viewDate = useMemo(
    () => initialShareViewDate(rangeStart, rangeEnd, includedDateKeys ?? undefined),
    [rangeStart, rangeEnd, includedDateKeys],
  );

  const weekStart = berlinStartOfWeek(viewDate);
  const weekEnd = berlinEndOfWeek(viewDate);

  const rangeDayCount = useMemo(
    () => differenceInCalendarDays(startOfDay(rangeEnd), startOfDay(rangeStart)) + 1,
    [rangeStart, rangeEnd],
  );

  const visibleDayCount = useMemo(() => {
    const daySpan = includedDateKeys?.length ?? rangeDayCount;
    return clampWeekCalendarVisibleDayCount(Math.min(7, Math.max(3, daySpan)));
  }, [includedDateKeys, rangeDayCount]);

  const sharedHighlightKeys = useMemo(
    () => (includedDateKeys ? new Set(includedDateKeys) : undefined),
    [includedDateKeys],
  );

  const timedBlocks = useMemo(
    () =>
      publicBlocksToWeekCalendarBlocks({
        blocks: snapshot.blocks,
        rangeStart,
        rangeEnd,
        includedDateKeys: includedKeySet ?? undefined,
        busyAnonymousLabel: ui.scheduleShare.busyAnonymous,
      }),
    [snapshot.blocks, rangeStart, rangeEnd, includedKeySet, ui.scheduleShare.busyAnonymous],
  );

  const layoutRef = useRef<HTMLDivElement>(null);
  const measuredBodyPx = useShareWeekCalendarMaxViewportBodyPx(layoutRef, { enabled: true });
  const viewportBodyPx = Math.min(measuredBodyPx ?? 128, 128);

  return (
    <div
      ref={layoutRef}
      className={cn(
        "pointer-events-none relative flex h-[9.5rem] min-h-[9.5rem] flex-col overflow-hidden rounded-xl border border-sky-200/70 bg-white/90 dark:border-sky-800/50 dark:bg-sky-950/20",
        className,
      )}
      aria-hidden
    >
      <div className="min-h-0 flex-1">
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
          shareExcludedDayLabel={ui.scheduleShare.shareExcludedDayBadge}
          fillParent
          maxViewportBodyPx={viewportBodyPx}
          showTimeColumnLabel={false}
          minuteScale={48}
          onMinuteScaleChange={() => {}}
        />
      </div>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-sky-50/95 to-transparent dark:from-sky-950/90" />
    </div>
  );
}
