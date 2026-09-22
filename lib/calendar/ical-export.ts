import { addDays, startOfDay } from "date-fns";
import type { Weekday } from "@prisma/client";
import { createHash } from "crypto";

import {
  escapeIcsText,
  foldIcsLine,
  formatIcsDate,
  formatIcsFloatingLocal,
  formatIcsUtc,
  isBerlinAllDayRange,
} from "@/lib/calendar/ical-shared";

const WEEKDAY_TO_JS: Record<Weekday, number> = {
  MON: 1,
  TUE: 2,
  WED: 3,
  THU: 4,
  FRI: 5,
  SAT: 6,
  SUN: 0,
};

export type ExportClassBlock = {
  sessionId?: string;
  courseId: string;
  courseName: string;
  courseCode: string | null;
  /** Per-course bounds; legacy callers can continue using the global bounds. */
  lecturePeriodStart?: Date;
  lecturePeriodEnd?: Date;
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
  location: string | null;
};

export type ExportCalendarEntry = {
  uid?: string;
  startAt: Date;
  endAt: Date;
  title: string;
  location: string | null;
  note: string | null;
};

function minutesToClock(minute: number): { h: number; m: number } {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return { h, m };
}

function expandClassOccurrences(
  block: ExportClassBlock,
  semesterStart: Date,
  semesterEnd: Date,
): Array<{ uid: string; start: Date; end: Date; summary: string; location: string | null; description: string }> {
  const out: Array<{ uid: string; start: Date; end: Date; summary: string; location: string | null; description: string }> = [];
  const want = WEEKDAY_TO_JS[block.weekday];
  const { h: sh, m: sm } = minutesToClock(block.startMinute);
  const { h: eh, m: em } = minutesToClock(block.endMinute);

  const summary = block.courseCode ? `${block.courseCode} · ${block.courseName}` : block.courseName;
  const description = `SideSeat course session (courseId=${block.courseId})`;

  let d = startOfDay(semesterStart);
  const last = startOfDay(semesterEnd);
  while (d <= last) {
    if (d.getDay() === want) {
      const start = new Date(d);
      start.setHours(sh, sm, 0, 0);
      const end = new Date(d);
      end.setHours(eh, em, 0, 0);
      if (end > start) {
        out.push({
          uid: stableIcsUid(
            `course-session:${block.sessionId ?? `${block.courseId}:${block.weekday}:${block.startMinute}:${block.endMinute}`}:${formatIcsDate(start)}`,
          ),
          start,
          end,
          summary,
          location: block.location,
          description,
        });
      }
    }
    d = addDays(d, 1);
  }
  return out;
}

/** Stable UIDs are essential for subscribed feeds; random UIDs duplicate every refresh. */
function stableIcsUid(source: string): string {
  return `${createHash("sha256").update(source, "utf8").digest("hex")}@calendar.sideseat.de`;
}

function pushVevent(
  body: string[],
  opts: {
    uid: string;
    dtstamp: Date;
    dtstart: string;
    dtend: string;
    summary: string;
    location: string | null;
    description: string | null;
    allDay?: boolean;
  },
): void {
  body.push("BEGIN:VEVENT");
  body.push(foldIcsLine(`UID:${opts.uid}`));
  body.push(foldIcsLine(`DTSTAMP:${formatIcsUtc(opts.dtstamp)}`));
  const valueType = opts.allDay ? ";VALUE=DATE" : "";
  body.push(foldIcsLine(`DTSTART${valueType}:${opts.dtstart}`));
  body.push(foldIcsLine(`DTEND${valueType}:${opts.dtend}`));
  body.push(foldIcsLine(`SUMMARY:${escapeIcsText(opts.summary)}`));
  if (opts.location) {
    body.push(foldIcsLine(`LOCATION:${escapeIcsText(opts.location)}`));
  }
  if (opts.description) {
    body.push(foldIcsLine(`DESCRIPTION:${escapeIcsText(opts.description)}`));
  }
  body.push("END:VEVENT");
}

/**
 * Builds a VCALENDAR string with class sessions (expanded per semester day) and
 * calendar entries (UTC Z timestamps from DB).
 */
export function buildSideSeatIcsExport(opts: {
  semesterStart: Date;
  semesterEnd: Date;
  classBlocks: ExportClassBlock[];
  entries: ExportCalendarEntry[];
}): string {
  // A subscribed feed must be byte-stable when its events have not changed;
  // using the request time here defeats ETag revalidation on every refresh.
  // SideSeat does not yet persist a per-event updatedAt value, so keep this
  // publication marker stable and let UID plus event fields carry updates.
  const dtstamp = new Date("2000-01-01T00:00:00.000Z");
  const body: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SideSeat//Calendar Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:SideSeat",
  ];

  for (const block of opts.classBlocks) {
    for (const occ of expandClassOccurrences(
      block,
      block.lecturePeriodStart ?? opts.semesterStart,
      block.lecturePeriodEnd ?? opts.semesterEnd,
    )) {
      pushVevent(body, {
        uid: occ.uid,
        dtstamp,
        dtstart: formatIcsFloatingLocal(occ.start),
        dtend: formatIcsFloatingLocal(occ.end),
        summary: occ.summary,
        location: occ.location,
        description: occ.description,
      });
    }
  }

  for (const e of opts.entries) {
    const allDay = isBerlinAllDayRange(e.startAt, e.endAt);
    pushVevent(body, {
      uid: stableIcsUid(
        e.uid ??
          `event:${e.startAt.toISOString()}:${e.endAt.toISOString()}:${e.title}:${e.location ?? ""}`,
      ),
      dtstamp,
      dtstart: allDay ? formatIcsDate(e.startAt) : formatIcsUtc(e.startAt),
      dtend: allDay ? formatIcsDate(e.endAt) : formatIcsUtc(e.endAt),
      summary: e.title,
      location: e.location,
      description: e.note,
      allDay,
    });
  }

  body.push("END:VCALENDAR");
  return body.join("\r\n") + "\r\n";
}
