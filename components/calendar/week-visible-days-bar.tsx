"use client";

import { useCallback, useRef, useState } from "react";

import {
  WEEK_CALENDAR_VISIBLE_DAY_MAX,
  WEEK_CALENDAR_VISIBLE_DAY_MIN,
  clampWeekCalendarVisibleDayCount,
} from "@/lib/calendar/week-calendar-constants";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { formatMessage, type AppMessages } from "@/lib/i18n/messages";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { cn } from "@/lib/utils";

const DAY_RANGE = WEEK_CALENDAR_VISIBLE_DAY_MAX - WEEK_CALENDAR_VISIBLE_DAY_MIN;

function ratioFromValue(count: number): number {
  return (clampWeekCalendarVisibleDayCount(count) - WEEK_CALENDAR_VISIBLE_DAY_MIN) / DAY_RANGE;
}

function valueFromRatio(ratio: number): number {
  const raw = WEEK_CALENDAR_VISIBLE_DAY_MIN + ratio * DAY_RANGE;
  return clampWeekCalendarVisibleDayCount(Math.round(raw));
}

export function WeekVisibleDaysBar({
  value,
  onChange,
  scheduleSch,
  locale,
}: {
  value: number;
  onChange: (next: number) => void;
  scheduleSch?: AppMessages["schedule"];
  locale?: AppLocale;
}) {
  const ctx = useLocaleContext();
  const sch = scheduleSch ?? ctx.messages.schedule;
  const loc = locale ?? ctx.locale;

  const safeValue = clampWeekCalendarVisibleDayCount(value);
  const valueTemplate =
    sch.visibleDaysValue ?? (loc === "zh-CN" ? "{count} 天" : "{count} days");

  const trackRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);
  /** Continuous 0–1 thumb position while dragging; null = snapped to `value`. */
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  const ratioFromClientX = useCallback((clientX: number) => {
    const track = trackRef.current;
    if (!track) return ratioFromValue(safeValue);
    const rect = track.getBoundingClientRect();
    const x = clientX - rect.left;
    return Math.max(0, Math.min(1, x / Math.max(1, rect.width)));
  }, [safeValue]);

  const displayRatio = dragRatio ?? ratioFromValue(safeValue);
  const displayValue = dragRatio != null ? valueFromRatio(dragRatio) : safeValue;
  const valueText = formatMessage(valueTemplate, { count: displayValue });
  const isDragging = dragRatio != null;

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      setDragRatio(ratioFromClientX(event.clientX));
    },
    [ratioFromClientX],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      setDragRatio(ratioFromClientX(event.clientX));
    },
    [ratioFromClientX],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      const ratio = ratioFromClientX(event.clientX);
      setDragRatio(null);
      onChange(valueFromRatio(ratio));
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* capture may already be released */
      }
    },
    [onChange, ratioFromClientX],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
        event.preventDefault();
        onChange(clampWeekCalendarVisibleDayCount(safeValue - 1));
      } else if (event.key === "ArrowRight" || event.key === "ArrowUp") {
        event.preventDefault();
        onChange(clampWeekCalendarVisibleDayCount(safeValue + 1));
      }
    },
    [onChange, safeValue],
  );

  const ariaLabel =
    sch.visibleDaysAria ??
    (loc === "zh-CN" ? "周视图显示天数" : "Visible days in week calendar");

  return (
    <div
      className={cn(
        "shrink-0 rounded-xl border border-[#E7E0D6] bg-white px-2 py-1.5 shadow-[0_2px_8px_rgba(15,23,42,0.03)]",
        "dark:border-border dark:bg-card dark:shadow-[0_2px_8px_rgba(0,0,0,0.1)]",
      )}
    >
      <div className="relative h-9 px-[2.125rem]">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={0}
          aria-label={ariaLabel}
          aria-valuemin={WEEK_CALENDAR_VISIBLE_DAY_MIN}
          aria-valuemax={WEEK_CALENDAR_VISIBLE_DAY_MAX}
          aria-valuenow={displayValue}
          aria-valuetext={valueText}
          className={cn(
            "relative h-full w-full select-none touch-none",
            "cursor-grab outline-none active:cursor-grabbing",
            "[-webkit-touch-callout:none]",
          )}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onContextMenu={(event) => event.preventDefault()}
          onKeyDown={onKeyDown}
        >
          <div
            className="pointer-events-none absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-100 dark:bg-blue-950/40"
            aria-hidden
          />
          <div
            className={cn(
              "pointer-events-none absolute top-1/2 z-10 -translate-y-1/2",
              !isDragging && "transition-[left] duration-200 ease-out",
            )}
            style={{ left: `${displayRatio * 100}%` }}
            aria-hidden
          >
            <span
              className={cn(
                "inline-flex w-[4.25rem] -translate-x-1/2 items-center justify-center",
                "rounded-md bg-[#2563EB] px-2 py-1.5 text-[11px] font-semibold leading-none text-white tabular-nums",
                "shadow-[0_2px_8px_rgba(37,99,235,0.35)]",
                "dark:bg-blue-500",
                isDragging && "scale-[1.02]",
              )}
            >
              {valueText}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
