import "server-only";

import type { User } from "@prisma/client";

import {
  calendarSubscriptionExportWindow,
  calendarYearExportWindow,
  calendarYearInBerlin,
  clipLecturePeriodToExportWindow,
} from "@/lib/calendar/calendar-export-window";
import {
  calendarCourseMirrorKeySet,
  isCanonicalCourseSlotMirrored,
} from "@/lib/calendar/calendar-course-mirror";
import { buildSideSeatIcsExport } from "@/lib/calendar/ical-export";
import { loadCalendarEntryOccurrences } from "@/lib/calendar/load-calendar-entry-occurrences";
import { getOfficialClassScheduleDateRangeForSemester } from "@/lib/constants/vorlesungszeit";
import { prisma } from "@/lib/db/prisma";

export async function loadCalendarIcsExport(
  user: Pick<User, "id" | "school">,
  options: {
    now?: Date;
    year?: number;
    mode?: "year" | "subscription";
  } = {},
) {
  const now = options.now ?? new Date();
  const exportWindow =
    options.mode === "subscription"
      ? calendarSubscriptionExportWindow(now)
      : calendarYearExportWindow(options.year ?? calendarYearInBerlin(now));

  const [memberships, entries, mirroredScheduleRows] = await Promise.all([
    prisma.userCourse.findMany({
      // activeUntil controls course discoverability, not retained calendar history.
      where: { userId: user.id },
      include: {
        course: true,
        sessions: { orderBy: [{ weekday: "asc" }, { startMinute: "asc" }] },
      },
      orderBy: { courseId: "asc" },
    }),
    loadCalendarEntryOccurrences(prisma, {
      userId: user.id,
      windowStart: exportWindow.start,
      windowEnd: exportWindow.end,
    }),
    // A mirror key represents the whole weekly slot. Keep checking all stored
    // rows, not just this export window, so deleting or moving one occurrence
    // never resurrects the canonical course block for that date.
    prisma.calendarEntry.findMany({
      where: {
        userId: user.id,
        projectionStatus: "ACTIVE",
        courseScheduleMirrorKey: { not: null },
      },
      select: { courseScheduleMirrorKey: true },
    }),
  ]);

  const mirroredScheduleKeys = calendarCourseMirrorKeySet(mirroredScheduleRows);

  const classBlocks = memberships.flatMap((membership) => {
    const lecturePeriod = getOfficialClassScheduleDateRangeForSemester({
      school: membership.course.school,
      semesterLabel: membership.course.semesterLabel,
    });
    const clippedLecturePeriod = lecturePeriod
      ? clipLecturePeriodToExportWindow(lecturePeriod, exportWindow)
      : null;
    if (!clippedLecturePeriod) return [];

    return membership.sessions
      .filter(
        (session) =>
          !isCanonicalCourseSlotMirrored(mirroredScheduleKeys, {
            courseId: membership.course.id,
            weekday: session.weekday,
            startMinute: session.startMinute,
          }),
      )
      .map((session) => ({
        courseId: membership.course.id,
        courseName: membership.course.name,
        courseCode: membership.course.code,
        lecturePeriodStart: clippedLecturePeriod.start,
        lecturePeriodEnd: clippedLecturePeriod.end,
        weekday: session.weekday,
        startMinute: session.startMinute,
        endMinute: session.endMinute,
        location: session.location,
      }));
  });

  return buildSideSeatIcsExport({
    // Compatibility fallback for callers constructing class blocks without
    // per-course bounds; all blocks above carry their legitimate term range.
    semesterStart: new Date(exportWindow.firstYear, 0, 1),
    semesterEnd: new Date(exportWindow.lastYear, 11, 31, 23, 59, 59, 999),
    classBlocks,
    // Mirror rows are user-editable calendar events and therefore win over
    // their canonical CourseSession. Export them exactly as the user sees them.
    entries: entries.map((entry) => ({
      uid: entry.id,
      startAt: entry.startAt,
      endAt: entry.endAt,
      title: entry.title,
      location: entry.location,
      note: entry.note,
    })),
  });
}
