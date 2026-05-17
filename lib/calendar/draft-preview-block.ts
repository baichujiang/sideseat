/** In-grid draft block while creating an event or a schedule-share proposal. */
export const DRAFT_PREVIEW_COURSE_ID = "__draft-preview__";

export function isDraftPreviewCourseId(courseId: string): boolean {
  return courseId === DRAFT_PREVIEW_COURSE_ID;
}
