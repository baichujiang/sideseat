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

  /**
   * Search used to use a single `findMany` + `take: 10` with no `orderBy`. When
   * many rows matched the OR (e.g. broad name matches), Postgres could return
   * an arbitrary 10 rows and omit an exact code hit that exists — users saw
   * "course not found" even though it was in the DB. We always pull an exact
   * code row first (same semester + school), then fill with prefix/name hits.
   */
  const [exactCodeRow, broadRows] = await Promise.all([
    prisma.course.findFirst({
      where: { school, semesterLabel, code: upper },
      include: { _count: { select: { members: true } } },
    }),
    prisma.course.findMany({
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
      orderBy: [{ code: "asc" }, { name: "asc" }],
      take: 40,
    }),
  ]);

  const byId = new Map<string, (typeof broadRows)[number]>();
  for (const row of broadRows) {
    byId.set(row.id, row);
  }
  if (exactCodeRow) {
    byId.set(exactCodeRow.id, exactCodeRow);
  }
  const matches = [...byId.values()];

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
    })
    .slice(0, 10);

  return ok({ hits });
}
