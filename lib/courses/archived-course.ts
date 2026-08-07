import { courseIdentityKey } from "@/lib/courses/course-identity";
import { schoolIdentityChanged } from "@/lib/profile/school-change";

export type ArchivedCourseRestoreBlockReason =
  | "SCHOOL_MISMATCH"
  | "ACTIVE_EQUIVALENT";

export function archivedCourseRestoreBlockReason(options: {
  userSchool: string | null | undefined;
  course: { id: string; school: string; code: string | null };
  activeCourseIdentities: ReadonlySet<string>;
}): ArchivedCourseRestoreBlockReason | null {
  if (schoolIdentityChanged(options.userSchool, options.course.school)) {
    return "SCHOOL_MISMATCH";
  }
  if (options.activeCourseIdentities.has(courseIdentityKey(options.course))) {
    return "ACTIVE_EQUIVALENT";
  }
  return null;
}
