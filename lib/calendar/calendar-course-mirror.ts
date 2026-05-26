/** Rows created by “mirror timetable to calendar” — visually treated as courses without a user category. */
export function isCalendarCourseMirrorRow(e: {
  source?: string | null;
  courseScheduleMirrorKey?: string | null;
}): boolean {
  return Boolean(e.courseScheduleMirrorKey?.trim()) || e.source === "course_mirror";
}
