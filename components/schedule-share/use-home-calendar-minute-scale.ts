"use client";

import { useEffect, useState } from "react";

import {
  HOME_CALENDAR_MINUTE_SCALE_STORAGE_KEY,
  readHomeCalendarMinuteScaleFromStorage,
} from "@/lib/calendar/home-calendar-preferences";

/** Pinch-zoom scale for week grids — shared with Home and share calendars. */
export function useHomeCalendarMinuteScale() {
  const [minuteScale, setMinuteScale] = useState(readHomeCalendarMinuteScaleFromStorage);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      window.localStorage.setItem(HOME_CALENDAR_MINUTE_SCALE_STORAGE_KEY, String(minuteScale));
    }, 180);
    return () => window.clearTimeout(timeoutId);
  }, [minuteScale]);

  return [minuteScale, setMinuteScale] as const;
}
