import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { buildSideSeatIcsExport } from "../../lib/calendar/ical-export";
import { parseIcsForImport } from "../../lib/calendar/ical-import-parse";
import { prepareCalendarIcsImport } from "../../lib/calendar/import-ics-events";

function calendar(...events: string[]) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SideSeat Tests//EN",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

describe("iCalendar import and export", () => {
  it("imports all-day dates and TZID times without shifting the Berlin calendar day", () => {
    const raw = calendar(
      [
        "BEGIN:VEVENT",
        "UID:all-day",
        "DTSTART;VALUE=DATE:20261025",
        "DTEND;VALUE=DATE:20261027",
        "SUMMARY:Reading week",
        "END:VEVENT",
      ].join("\r\n"),
      [
        "BEGIN:VEVENT",
        "UID:new-york-call",
        "DTSTART;TZID=America/New_York:20261026T090000",
        "DTEND;TZID=America/New_York:20261026T100000",
        "SUMMARY:New York call",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const result = parseIcsForImport(raw);

    assert.equal(result.skipped, 0);
    assert.deepEqual(
      result.events.map((event) => ({
        title: event.title,
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        allDay: event.allDay,
      })),
      [
        {
          title: "Reading week",
          start: "2026-10-24T22:00:00.000Z",
          end: "2026-10-26T23:00:00.000Z",
          allDay: true,
        },
        {
          title: "New York call",
          start: "2026-10-26T13:00:00.000Z",
          end: "2026-10-26T14:00:00.000Z",
          allDay: false,
        },
      ],
    );
  });

  it("accepts a bounded multi-day event and exports it as VALUE=DATE", () => {
    const prepared = prepareCalendarIcsImport(
      calendar(
        [
          "BEGIN:VEVENT",
          "UID:all-day",
          "DTSTART;VALUE=DATE:20261025",
          "DTEND;VALUE=DATE:20261027",
          "SUMMARY:Reading week",
          "END:VEVENT",
        ].join("\r\n"),
      ),
      { now: new Date("2026-08-10T00:00:00.000Z") },
    );

    assert.equal(prepared.events.length, 1);
    const event = prepared.events[0]!;
    const exported = buildSideSeatIcsExport({
      semesterStart: new Date("2026-10-01T00:00:00.000Z"),
      semesterEnd: new Date("2026-11-30T00:00:00.000Z"),
      classBlocks: [],
      entries: [
        {
          startAt: event.start,
          endAt: event.end,
          title: event.title,
          location: event.location,
          note: event.note,
        },
      ],
    });

    assert.match(exported, /DTSTART;VALUE=DATE:20261025/);
    assert.match(exported, /DTEND;VALUE=DATE:20261027/);
  });

  it("rejects all-day spans longer than the UI safety bound", () => {
    const raw = calendar(
      [
        "BEGIN:VEVENT",
        "UID:too-long",
        "DTSTART;VALUE=DATE:20261001",
        "DTEND;VALUE=DATE:20261201",
        "SUMMARY:Bad feed span",
        "END:VEVENT",
      ].join("\r\n"),
    );

    assert.throws(
      () => prepareCalendarIcsImport(raw, { now: new Date("2026-08-10T00:00:00.000Z") }),
      /No importable events/,
    );
  });
});
