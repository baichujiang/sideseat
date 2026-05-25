"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  onAdjustingChange,
  scheduleSch,
  locale,
}: {
  value: number;
  onChange: (next: number) => void;
  /** Fired when the user starts/ends dragging the width slider (Home week anchor). */
  onAdjustingChange?: (adjusting: boolean) => void;
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
  /** Latest committed day count — avoids stale `safeValue` during fast drags. */
  const committedValueRef = useRef(safeValue);
  committedValueRef.current = safeValue;
  const pendingChangeRafRef = useRef<number | null>(null);
  const pendingChangeValueRef = useRef<number | null>(null);
  /** Continuous 0–1 thumb position while dragging; null = snapped to `value`. */
  const [dragRatio, setDragRatio] = useState<number | null>(null);

  useEffect(
    () => () => {
      if (pendingChangeRafRef.current != null) {
        cancelAnimationFrame(pendingChangeRafRef.current);
      }
    },
    [],
  );

  const flushPendingChange = useCallback(() => {
    pendingChangeRafRef.current = null;
    const next = pendingChangeValueRef.current;
    pendingChangeValueRef.current = null;
    if (next == null || next === committedValueRef.current) return;
    onChange(next);
  }, [onChange]);

  /** At most one calendar width update per frame while dragging. */
  const scheduleChange = useCallback(
    (next: number) => {
      if (next === committedValueRef.current) return;
      pendingChangeValueRef.current = next;
      if (pendingChangeRafRef.current == null) {
        pendingChangeRafRef.current = requestAnimationFrame(flushPendingChange);
      }
    },
    [flushPendingChange],
  );

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

  /** Thumb follows `ratio` continuously; calendar width updates when snapped day count changes. */
  const applyPointerRatio = useCallback(
    (clientX: number, { finalize = false }: { finalize?: boolean } = {}) => {
      const ratio = ratioFromClientX(clientX);
      const nextValue = valueFromRatio(ratio);
      if (finalize) {
        if (pendingChangeRafRef.current != null) {
          cancelAnimationFrame(pendingChangeRafRef.current);
          pendingChangeRafRef.current = null;
          pendingChangeValueRef.current = null;
        }
        setDragRatio(null);
        onChange(nextValue);
        return;
      }
      setDragRatio(ratio);
      scheduleChange(nextValue);
    },
    [onChange, ratioFromClientX, scheduleChange],
  );

  const onPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      onAdjustingChange?.(true);
      event.currentTarget.setPointerCapture(event.pointerId);
      applyPointerRatio(event.clientX);
    },
    [applyPointerRatio, onAdjustingChange],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      applyPointerRatio(event.clientX);
    },
    [applyPointerRatio],
  );

  const endDrag = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      applyPointerRatio(event.clientX, { finalize: true });
      onAdjustingChange?.(false);
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {
        /* capture may already be released */
      }
    },
    [applyPointerRatio, onAdjustingChange],
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
