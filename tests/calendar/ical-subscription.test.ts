import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { parseIcsForSubscriptionWindow } from "../../lib/calendar/ical-import-parse";

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

describe("parseIcsForSubscriptionWindow", () => {
  it("expands time-zone-aware recurrences, exclusions and overrides across DST", () => {
    const raw = calendar(
      [
        "BEGIN:VEVENT",
        "UID:dst-weekly",
        "DTSTAMP:20261001T000000Z",
        "DTSTART;TZID=Europe/Berlin:20261019T090000",
        "DTEND;TZID=Europe/Berlin:20261019T100000",
        "RRULE:FREQ=WEEKLY;COUNT=4",
        "EXDATE;TZID=Europe/Berlin:20261026T090000",
        "SUMMARY:Weekly seminar",
        "LOCATION:Room A",
        "DESCRIPTION:Base note",
        "END:VEVENT",
      ].join("\r\n"),
      [
        "BEGIN:VEVENT",
        "UID:dst-weekly",
        "RECURRENCE-ID;TZID=Europe/Berlin:20261102T090000",
        "DTSTAMP:20261020T000000Z",
        "DTSTART;TZID=Europe/Berlin:20261102T113000",
        "DTEND;TZID=Europe/Berlin:20261102T123000",
        "SUMMARY:Moved seminar",
        "LOCATION:Room B",
        "DESCRIPTION:Moved note",
        "END:VEVENT",
      ].join("\r\n"),
      [
        "BEGIN:VEVENT",
        "UID:dst-weekly",
        "RECURRENCE-ID;TZID=Europe/Berlin:20261109T090000",
        "DTSTAMP:20261020T000000Z",
        "DTSTART;TZID=Europe/Berlin:20261109T090000",
        "DTEND;TZID=Europe/Berlin:20261109T100000",
        "STATUS:CANCELLED",
        "SUMMARY:Cancelled seminar",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const result = parseIcsForSubscriptionWindow(
      raw,
      new Date("2026-10-18T00:00:00.000Z"),
      new Date("2026-11-15T00:00:00.000Z"),
    );

    assert.deepEqual(
      result.events.map((event) => ({
        start: event.start.toISOString(),
        end: event.end.toISOString(),
        title: event.title,
        location: event.location,
        note: event.note,
      })),
      [
        {
          start: "2026-10-19T07:00:00.000Z",
          end: "2026-10-19T08:00:00.000Z",
          title: "Weekly seminar",
          location: "Room A",
          note: "Base note",
        },
        {
          start: "2026-11-02T10:30:00.000Z",
          end: "2026-11-02T11:30:00.000Z",
          title: "Moved seminar",
          location: "Room B",
          note: "Moved note",
        },
      ],
    );
  });

  it("limits dense recurring feeds and ignores all-day events", () => {
    const raw = calendar(
      [
        "BEGIN:VEVENT",
        "UID:dense",
        "DTSTAMP:20260701T000000Z",
        "DTSTART:20260701T000000Z",
        "DTEND:20260701T000100Z",
        "RRULE:FREQ=MINUTELY;COUNT=1000",
        "SUMMARY:Dense feed",
        "END:VEVENT",
      ].join("\r\n"),
      [
        "BEGIN:VEVENT",
        "UID:all-day",
        "DTSTAMP:20260701T000000Z",
        "DTSTART;VALUE=DATE:20260702",
        "DTEND;VALUE=DATE:20260703",
        "SUMMARY:All day",
        "END:VEVENT",
      ].join("\r\n"),
    );

    const result = parseIcsForSubscriptionWindow(
      raw,
      new Date("2026-07-01T00:00:00.000Z"),
      new Date("2026-07-03T00:00:00.000Z"),
    );

    assert.equal(result.events.length, 400);
    assert.ok(result.events.every((event) => event.title === "Dense feed"));
  });
});
