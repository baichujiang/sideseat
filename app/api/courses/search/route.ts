import { NextRequest } from "next/server";

import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ok } from "@/lib/http";

type CourseHit = {
  id: string;
  code: string | null;
  name: string;
  memberCount: number;
  enrolled: boolean;
  saved: boolean;
};

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  const url = new URL(request.url);
  const raw = url.searchParams.get("q")?.trim() ?? "";
  const requestedSchool = normalizeSchoolCode(url.searchParams.get("school"));
  const school =
    requestedSchool ??
    (user && user.onboardingComplete
      ? (normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL)
      : DEFAULT_SCHOOL);
  const semesterLabel = getCurrentSemesterLabel();

  if (raw.length < 2) {
    return ok({ hits: [] as CourseHit[] });
  }

  const upper = raw.toUpperCase();

  const matches = await prisma.course.findMany({
    where: {
      school,
      semesterLabel,
      OR: [
        { code: { startsWith: upper } },
        { name: { contains: raw, mode: "insensitive" } },
      ],
    },
    include: {
      _count: { select: { members: true } },
    },
    take: 10,
  });

  const ids = matches.map((c) => c.id);
  const [enrolledRows, savedRows] =
    user && user.onboardingComplete
      ? await Promise.all([
          prisma.userCourse.findMany({
            where: { userId: user.id, courseId: { in: ids } },
            select: { courseId: true },
          }),
          prisma.savedCourse.findMany({
            where: { userId: user.id, courseId: { in: ids } },
            select: { courseId: true },
          }),
        ])
      : [[], []];
  const enrolledSet = new Set(enrolledRows.map((r) => r.courseId));
  const savedSet = new Set(savedRows.map((r) => r.courseId));

  const hits: CourseHit[] = matches
    .map((course) => ({
      id: course.id,
      code: course.code,
      name: course.name,
      memberCount: course._count.members,
      enrolled: enrolledSet.has(course.id),
      saved: savedSet.has(course.id),
    }))
    // Exact code match wins, then popularity, then alpha by name.
    .sort((a, b) => {
      const aExact = a.code?.toUpperCase() === upper ? 1 : 0;
      const bExact = b.code?.toUpperCase() === upper ? 1 : 0;
      if (aExact !== bExact) return bExact - aExact;
      if (b.memberCount !== a.memberCount) return b.memberCount - a.memberCount;
      return a.name.localeCompare(b.name);
    });

  return ok({ hits });
}
