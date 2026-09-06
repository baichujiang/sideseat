import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  calendarExportFilename,
  calendarSubscriptionExportWindow,
  calendarYearExportWindow,
  clipLecturePeriodToExportWindow,
  parseCalendarExportYear,
} from "../../lib/calendar/calendar-export-window";
import {
  calendarCourseMirrorKeySet,
  isCanonicalCourseSlotMirrored,
} from "../../lib/calendar/calendar-course-mirror";
import { buildSideSeatIcsExport } from "../../lib/calendar/ical-export";
import { getOfficialClassScheduleDateRangeForSemester } from "../../lib/constants/vorlesungszeit";

function courseStarts(ics: string, summary: string): string[] {
  return ics
    .split("BEGIN:VEVENT")
    .slice(1)
    .filter((event) => event.includes(`SUMMARY:${summary}\r\n`))
    .map((event) => event.match(/DTSTART:(\d{8}T\d{6})/)?.[1])
    .filter((value): value is string => Boolean(value));
}

describe("calendar export year windows", () => {
  it("uses Europe/Berlin Jan 1 and Dec 31 boundaries for a selected year", () => {
    const window = calendarYearExportWindow(2026);

    assert.equal(window.start.toISOString(), "2025-12-31T23:00:00.000Z");
    assert.equal(window.end.toISOString(), "2026-12-31T23:00:00.000Z");
    assert.ok(new Date("2026-12-31T22:59:59.999Z") < window.end);
    assert.ok(!(new Date("2026-12-31T23:00:00.000Z") < window.end));
  });

  it("defaults one-time export to the current Berlin year and validates selections", () => {
    const beforeBerlinMidnight = new Date("2025-12-31T22:59:59.999Z");
    const atBerlinMidnight = new Date("2025-12-31T23:00:00.000Z");

    assert.equal(parseCalendarExportYear(null, beforeBerlinMidnight), 2025);
    assert.equal(parseCalendarExportYear(null, atBerlinMidnight), 2026);
    assert.equal(parseCalendarExportYear("2027", atBerlinMidnight), 2027);
    assert.equal(parseCalendarExportYear("2027.5", atBerlinMidnight), null);
    assert.equal(parseCalendarExportYear("1999", atBerlinMidnight), null);
    assert.equal(calendarExportFilename(2027), "sideseat-schedule-2027.ics");
  });

  it("rolls Apple subscriptions across previous, current, and next years", () => {
    const before = calendarSubscriptionExportWindow(
      new Date("2025-12-31T22:59:59.999Z"),
    );
    assert.deepEqual(
      {
        firstYear: before.firstYear,
        lastYear: before.lastYear,
        start: before.start.toISOString(),
        end: before.end.toISOString(),
      },
      {
        firstYear: 2024,
        lastYear: 2026,
        start: "2023-12-31T23:00:00.000Z",
        end: "2026-12-31T23:00:00.000Z",
      },
    );

    const after = calendarSubscriptionExportWindow(
      new Date("2025-12-31T23:00:00.000Z"),
    );
    assert.equal(after.firstYear, 2025);
    assert.equal(after.lastYear, 2027);
    assert.equal(after.start.toISOString(), "2024-12-31T23:00:00.000Z");
    assert.equal(after.end.toISOString(), "2027-12-31T23:00:00.000Z");
  });

  it("clips a selected year without moving a winter course outside its term", () => {
    const lecturePeriod = getOfficialClassScheduleDateRangeForSemester({
      school: "TUM",
      semesterLabel: "WS 2025/26",
    });
    assert.ok(lecturePeriod);
    const clipped = clipLecturePeriodToExportWindow(
      lecturePeriod,
      calendarYearExportWindow(2026),
    );
    assert.ok(clipped);
    assert.equal(clipped.start.getFullYear(), 2026);
    assert.equal(clipped.start.getMonth(), 0);
    assert.equal(clipped.start.getDate(), 1);
    assert.equal(clipped.end.getFullYear(), 2026);
    assert.equal(clipped.end.getMonth(), 1);
    assert.equal(clipped.end.getDate(), 6);
  });

  it("keeps course sessions in their own term inside a three-year feed", () => {
    const winter = getOfficialClassScheduleDateRangeForSemester({
      school: "TUM",
      semesterLabel: "WS 2025/26",
    });
    const summer = getOfficialClassScheduleDateRangeForSemester({
      school: "TUM",
      semesterLabel: "SS 2027",
    });
    assert.ok(winter);
    assert.ok(summer);

    const ics = buildSideSeatIcsExport({
      semesterStart: new Date(2025, 0, 1),
      semesterEnd: new Date(2027, 11, 31, 23, 59, 59, 999),
      classBlocks: [
        {
          sessionId: "winter-session",
          courseId: "winter-course",
          courseName: "Winter Course",
          courseCode: null,
          lecturePeriodStart: winter.start,
          lecturePeriodEnd: winter.end,
          weekday: "MON",
          startMinute: 9 * 60,
          endMinute: 10 * 60,
          location: null,
        },
        {
          sessionId: "summer-session",
          courseId: "summer-course",
          courseName: "Summer Course",
          courseCode: null,
          lecturePeriodStart: summer.start,
          lecturePeriodEnd: summer.end,
          weekday: "MON",
          startMinute: 11 * 60,
          endMinute: 12 * 60,
          location: null,
        },
      ],
      entries: [],
    });

    const winterStarts = courseStarts(ics, "Winter Course");
    assert.ok(winterStarts.length > 0);
    assert.equal(winterStarts[0], "20251013T090000");
    assert.equal(winterStarts.at(-1), "20260202T090000");
    assert.ok(winterStarts.every((start) => start < "20260301T000000"));

    const summerStarts = courseStarts(ics, "Summer Course");
    assert.ok(summerStarts.length > 0);
    assert.equal(summerStarts[0], "20270412T110000");
    assert.equal(summerStarts.at(-1), "20270712T110000");
  });

  it("exports courses only for a school semester with a published lecture period", () => {
    const tum = getOfficialClassScheduleDateRangeForSemester({
      school: "TUM",
      semesterLabel: "WS 2027/28",
    });
    const lmu = getOfficialClassScheduleDateRangeForSemester({
      school: "LMU",
      semesterLabel: "WS 2027/28",
    });
    assert.ok(tum);
    assert.ok(lmu);
    assert.equal(tum.start.toISOString(), lmu.start.toISOString());
    assert.equal(tum.end.toISOString(), lmu.end.toISOString());

    assert.equal(
      getOfficialClassScheduleDateRangeForSemester({
        school: "TUM",
        semesterLabel: "WS 2028/29",
      }),
      null,
    );
    assert.equal(
      getOfficialClassScheduleDateRangeForSemester({
        school: "LMU",
        semesterLabel: "WS 2025/99",
      }),
      null,
    );
    assert.equal(
      getOfficialClassScheduleDateRangeForSemester({
        school: "UNKNOWN",
        semesterLabel: "SS 2026",
      }),
      null,
    );
  });

  it("lets a stored course mirror own its canonical weekly slot", () => {
    const keys = calendarCourseMirrorKeySet([
      { courseScheduleMirrorKey: "course_1_MON_540" },
      { courseScheduleMirrorKey: null },
    ]);

    assert.equal(
      isCanonicalCourseSlotMirrored(keys, {
        courseId: "course_1",
        weekday: "MON",
        startMinute: 540,
      }),
      true,
    );
    assert.equal(
      isCanonicalCourseSlotMirrored(keys, {
        courseId: "course_1",
        weekday: "MON",
        startMinute: 600,
      }),
      false,
    );
  });
});
