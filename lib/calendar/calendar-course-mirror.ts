import type { Weekday } from "@prisma/client";

import { courseScheduleMirrorKey } from "@/lib/calendar/course-schedule-mirror";

/** Rows created by “mirror timetable to calendar” — visually treated as courses without a user category. */
export function isCalendarCourseMirrorRow(e: {
  source?: string | null;
  courseScheduleMirrorKey?: string | null;
}): boolean {
  return Boolean(e.courseScheduleMirrorKey?.trim()) || e.source === "course_mirror";
}

export function calendarCourseMirrorKeySet(
  rows: Array<{ courseScheduleMirrorKey?: string | null }>,
): Set<string> {
  return new Set(
    rows
      .map((row) => row.courseScheduleMirrorKey?.trim())
      .filter((key): key is string => Boolean(key)),
  );
}

export function isCanonicalCourseSlotMirrored(
  mirroredScheduleKeys: ReadonlySet<string>,
  slot: {
    courseId: string;
    weekday: Weekday;
    startMinute: number;
  },
): boolean {
  return mirroredScheduleKeys.has(
    courseScheduleMirrorKey(slot.courseId, slot.weekday, slot.startMinute),
  );
}
