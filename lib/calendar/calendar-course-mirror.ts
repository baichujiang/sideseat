/** Rows created by “mirror timetable to calendar” — always use the user’s `presetKey: course` category. */
export function isCalendarCourseMirrorRow(e: {
  source?: string | null;
  courseScheduleMirrorKey?: string | null;
}): boolean {
  return Boolean(e.courseScheduleMirrorKey?.trim()) || e.source === "course_mirror";
}
