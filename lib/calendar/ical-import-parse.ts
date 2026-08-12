import { fromZonedTime } from "date-fns-tz";
import ical, { type ParameterValue, type VEvent } from "node-ical";

import { SCHEDULE_DISPLAY_TZ } from "@/lib/calendar/schedule-berlin";

export type ParsedIcsEvent = {
  start: Date;
  end: Date;
  allDay: boolean;
  title: string;
  location: string | null;
  note: string | null;
};

function isAllDayEvent(event: VEvent): boolean {
  return event.datetype === "date" || event.start.dateOnly === true;
}

function localDateKey(date: Date): string {
  const year = String(date.getFullYear()).padStart(4, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** node-ical exposes date-only values at process-local midnight; pin that civil day to Berlin. */
function normalizeAllDayBoundary(date: Date): Date {
  return fromZonedTime(`${localDateKey(date)}T00:00:00`, SCHEDULE_DISPLAY_TZ);
}

function nextAllDayBoundary(date: Date): Date {
    const next = new Date(date);
    next.setDate(next.getDate() + 1);
    return normalizeAllDayBoundary(next);
}

function localDayOrdinal(date: Date): number {
  return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / (24 * 60 * 60 * 1_000);
}

function allDaySpanDays(event: VEvent): number {
  if (!event.start || !event.end) return 1;
  const span = Math.round(localDayOrdinal(event.end) - localDayOrdinal(event.start));
  return Math.max(1, span);
}

function recurringAllDayEnd(start: Date, event: VEvent): Date {
  const endDate = new Date(start);
  endDate.setDate(endDate.getDate() + allDaySpanDays(event));
  return normalizeAllDayBoundary(endDate);
}

function eventInterval(event: VEvent): { start: Date; end: Date; allDay: boolean } | null {
  if (!event.start) return null;
  const allDay = isAllDayEvent(event);
  const start = allDay ? normalizeAllDayBoundary(event.start) : new Date(event.start);
  const end = event.end
    ? allDay
      ? normalizeAllDayBoundary(event.end)
      : new Date(event.end)
    : allDay
      ? nextAllDayBoundary(event.start)
      : new Date(start.getTime() + 60 * 60 * 1_000);

  if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
    return null;
  }
  return { start, end, allDay };
}

/**
 * Parses non-recurring VEVENTs from raw .ics text. node-ical preserves TZID
 * semantics; date-only values are normalized to the calendar's Berlin civil day.
 */
export function parseIcsForImport(raw: string): { events: ParsedIcsEvent[]; skipped: number } {
  const events: ParsedIcsEvent[] = [];
  let skipped = 0;
  let parsed: ReturnType<typeof ical.sync.parseICS>;

  try {
    parsed = ical.sync.parseICS(raw);
  } catch {
    return { events, skipped: 1 };
  }

  for (const component of Object.values(parsed)) {
    if (!component || component.type !== "VEVENT") continue;
    const event = component as VEvent;
    if (event.status === "CANCELLED" || event.rrule) {
      skipped += 1;
      continue;
    }

    const interval = eventInterval(event);
    if (!interval) {
      skipped += 1;
      continue;
    }

    events.push({
      ...interval,
      title: subscriptionText(event.summary, 120) ?? "Imported event",
      location: subscriptionText(event.location, 120),
      note: subscriptionText(event.description, 500),
    });
  }

  return { events, skipped };
}

const MAX_SUBSCRIPTION_EVENTS = 400;
const MAX_DURATION_MS_SUB = 48 * 60 * 60 * 1000;
const MAX_ALL_DAY_DURATION_MS_SUB = (31 * 24 + 2) * 60 * 60 * 1000;

function parameterText(value: ParameterValue | undefined): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : value.val;
}

function subscriptionText(value: ParameterValue | undefined, maxLength: number): string | null {
  const normalized = parameterText(value)?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

/**
 * Parses VEVENTs for read-only subscription display. Recurrence expansion applies
 * RRULE, EXDATE and RECURRENCE-ID overrides while preserving source time zones.
 * Date-only events are normalized to Berlin midnight for the native all-day band.
 */
export function parseIcsForSubscriptionWindow(
  raw: string,
  windowStart: Date,
  windowEnd: Date,
): { events: ParsedIcsEvent[]; skipped: number } {
  const parsed = ical.sync.parseICS(raw);
  const events: ParsedIcsEvent[] = [];
  let skipped = 0;

  for (const component of Object.values(parsed)) {
    if (!component || component.type !== "VEVENT") continue;
    const event = component as VEvent;
    if (event.status === "CANCELLED") {
      skipped += 1;
      continue;
    }

    let instances;
    try {
      instances = ical.expandRecurringEvent(event, {
        from: windowStart,
        to: windowEnd,
        includeOverrides: true,
        excludeExdates: true,
        expandOngoing: true,
      });
    } catch {
      skipped += 1;
      continue;
    }

    let accepted = 0;
    for (const instance of instances) {
      if (events.length >= MAX_SUBSCRIPTION_EVENTS) break;
      if (instance.event.status === "CANCELLED") continue;

      const allDay = instance.isFullDay || instance.start.dateOnly === true;
      const start = allDay ? normalizeAllDayBoundary(instance.start) : new Date(instance.start);
      // node-ical expands recurring date-only DTEND by elapsed milliseconds. Around
      // a process-local DST boundary that can land at 23:00 or 01:00 and change the
      // apparent civil date. Preserve the source event's day span instead.
      const end = allDay
        ? recurringAllDayEnd(instance.start, instance.event)
        : new Date(instance.end);
      const duration = end.getTime() - start.getTime();
      const maximumDuration = allDay ? MAX_ALL_DAY_DURATION_MS_SUB : MAX_DURATION_MS_SUB;
      if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        duration <= 0 ||
        duration > maximumDuration
      ) {
        continue;
      }

      events.push({
        start,
        end,
        allDay,
        title: subscriptionText(instance.summary, 120) ?? "Calendar event",
        location: subscriptionText(instance.event.location, 120),
        note: subscriptionText(instance.event.description, 500),
      });
      accepted += 1;
    }

    if (accepted === 0) skipped += 1;
    if (events.length >= MAX_SUBSCRIPTION_EVENTS) break;
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { events, skipped };
}
