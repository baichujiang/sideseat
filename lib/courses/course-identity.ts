import type { Prisma } from "@prisma/client";

export function normalizeCourseIdentityCode(
  code: string | null | undefined,
): string | null {
  const normalized = code?.trim().toUpperCase().replace(/\s+/g, "");
  return normalized || null;
}

export function courseIdentityKey(course: {
  id: string;
  school: string;
  code: string | null;
}): string {
  const code = normalizeCourseIdentityCode(course.code);
  return code ? `${course.school.trim().toUpperCase()}:${code}` : `id:${course.id}`;
}

/** Same school + course code is the social identity across catalog semesters. */
export function sameCourseIdentityWhere(course: {
  id: string;
  school: string;
  code: string | null;
}): Prisma.CourseWhereInput {
  const code = normalizeCourseIdentityCode(course.code);
  if (!code) return { id: course.id };
  return {
    school: { equals: course.school, mode: "insensitive" },
    identityCode: code,
  };
}
