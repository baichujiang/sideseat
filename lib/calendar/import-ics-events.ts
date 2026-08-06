import type { Prisma } from "@prisma/client";

import { parseIcsForImport, type ParsedIcsEvent } from "@/lib/calendar/ical-import-parse";

export const MAX_ICS_IMPORT_BYTES = 512 * 1024;
export const MAX_ICS_IMPORT_EVENTS = 200;

const TEN_YEARS_MS = 10 * 365 * 24 * 60 * 60 * 1000;
const FOUR_YEARS_MS = 4 * 365 * 24 * 60 * 60 * 1000;
const MAX_DURATION_MS = 48 * 60 * 60 * 1000;

export type CalendarIcsImportIssue =
  | "EMPTY"
  | "TOO_LARGE"
  | "INVALID_CALENDAR"
  | "NO_EVENTS"
  | "NO_IMPORTABLE_EVENTS";

export class CalendarIcsImportError extends Error {
  constructor(
    readonly issue: CalendarIcsImportIssue,
    message: string,
  ) {
    super(message);
    this.name = "CalendarIcsImportError";
  }
}

export type PreparedCalendarIcsImport = {
  events: ParsedIcsEvent[];
  skipped: number;
};

export function prepareCalendarIcsImport(
  raw: string,
  options: { now?: Date } = {},
): PreparedCalendarIcsImport {
  if (Buffer.byteLength(raw, "utf8") === 0) {
    throw new CalendarIcsImportError("EMPTY", "The file is empty.");
  }
  if (Buffer.byteLength(raw, "utf8") > MAX_ICS_IMPORT_BYTES) {
    throw new CalendarIcsImportError("TOO_LARGE", "File is too large. Max 512 KB.");
  }
  if (!/BEGIN:VCALENDAR/i.test(raw)) {
    throw new CalendarIcsImportError(
      "INVALID_CALENDAR",
      "This file does not look like a valid iCalendar (.ics) export.",
    );
  }

  const { events, skipped: parseSkipped } = parseIcsForImport(raw);
  if (events.length === 0) {
    throw new CalendarIcsImportError(
      "NO_EVENTS",
      parseSkipped > 0
        ? "No importable events found (skipped all-day, recurring, or cancelled items)."
        : "No events found in this file.",
    );
  }

  const now = options.now ?? new Date();
  const minimumStart = now.getTime() - TEN_YEARS_MS;
  const maximumStart = now.getTime() + FOUR_YEARS_MS;
  let skipped = parseSkipped;
  const validEvents = events.filter((event) => {
    const duration = event.end.getTime() - event.start.getTime();
    if (duration <= 0 || duration > MAX_DURATION_MS) {
      skipped += 1;
      return false;
    }
    const start = event.start.getTime();
    if (start < minimumStart || start > maximumStart) {
      skipped += 1;
      return false;
    }
    return true;
  });

  const limitedEvents = validEvents.slice(0, MAX_ICS_IMPORT_EVENTS);
  skipped += Math.max(0, validEvents.length - MAX_ICS_IMPORT_EVENTS);
  if (limitedEvents.length === 0) {
    throw new CalendarIcsImportError(
      "NO_IMPORTABLE_EVENTS",
      "No importable events (wrong date range, too long, or skipped all-day/recurring/cancelled items).",
    );
  }

  return { events: limitedEvents, skipped };
}

export async function persistCalendarIcsImport(
  tx: Prisma.TransactionClient,
  userId: string,
  prepared: PreparedCalendarIcsImport,
) {
  for (const event of prepared.events) {
    await tx.calendarEntry.create({
      data: {
        userId,
        title: event.title,
        location: event.location,
        note: event.note,
        source: "ical",
        startAt: event.start,
        endAt: event.end,
        repeatRule: "NONE",
        repeatUntil: null,
      },
    });
  }
  return { imported: prepared.events.length, skipped: prepared.skipped };
}
