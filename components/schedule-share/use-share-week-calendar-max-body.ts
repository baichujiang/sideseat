"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

import { WEEK_CALENDAR_HEADER_HEIGHT_PX } from "@/components/calendar/week-calendar";

const MIN_BODY_PX = 140;

/**
 * Measure flex-allocated space for the share week grid so the timed body gets a
 * fixed scroll viewport (same idea as Home `weekHomeMaxViewportBodyPx`).
 */
export function useShareWeekCalendarMaxViewportBodyPx(
  layoutRef: RefObject<HTMLElement | null>,
  options?: {
    enabled?: boolean;
    /** UI directly under the calendar inside `layoutRef` (e.g. visible-days bar). */
    belowCalendarRef?: RefObject<HTMLElement | null>;
    /** Extra gap between calendar and `belowCalendarRef` (px). */
    gapBelowCalendarPx?: number;
  },
): number | undefined {
  const enabled = options?.enabled ?? true;
  const belowCalendarRef = options?.belowCalendarRef;
  const gapBelowCalendarPx = options?.gapBelowCalendarPx ?? 4;
  const [maxBodyPx, setMaxBodyPx] = useState<number | undefined>(undefined);

  useLayoutEffect(() => {
    if (!enabled) {
      setMaxBodyPx(undefined);
      return;
    }

    const measure = () => {
      const wrap = layoutRef.current;
      if (!wrap) return;
      const outerH = wrap.clientHeight;
      if (outerH <= 0) return;
      const belowH = belowCalendarRef?.current?.getBoundingClientRect().height ?? 0;
      const bodyPx = outerH - belowH - gapBelowCalendarPx - WEEK_CALENDAR_HEADER_HEIGHT_PX;
      if (!Number.isFinite(bodyPx)) return;
      setMaxBodyPx(Math.max(MIN_BODY_PX, Math.floor(bodyPx)));
    };

    measure();
    const ro = new ResizeObserver(measure);
    const wrapNode = layoutRef.current;
    const belowNode = belowCalendarRef?.current;
    if (wrapNode) ro.observe(wrapNode);
    if (belowNode) ro.observe(belowNode);

    const vv = window.visualViewport;
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    window.addEventListener("resize", measure);

    return () => {
      ro.disconnect();
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [enabled, layoutRef, belowCalendarRef, gapBelowCalendarPx]);

  if (!enabled) return undefined;
  // Undefined until useLayoutEffect measures — keeps SSR and the first client
  // paint identical (no window-based fallback that diverges from the server).
  return maxBodyPx;
}
