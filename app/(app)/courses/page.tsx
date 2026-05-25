import {
  CoursesPageClient,
  type CourseRow,
  type CoursesPagePayload,
  type EnrolledCourseRow,
} from "@/components/courses/courses-page-client";
import { getSessionUser } from "@/lib/auth/session";
import {
  DEFAULT_SCHOOL,
  normalizeSchoolCode,
  type SchoolCode,
} from "@/lib/constants/schools";
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { prisma } from "@/lib/db/prisma";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { schoolCodesForDiscoverCity } from "@/lib/discover/city-school-scope";
import { getServerDiscoverServedCity } from "@/lib/discover/discover-city-preference";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { getRecommendedClassmatesForViewer } from "@/lib/queries/recommended-classmates";
import {
  coursesListReturnPath,
  normalizeCoursesTab,
} from "@/lib/courses/courses-tab";

// Starter set for common required/foundation courses (used as fallback when
// popularity signals are sparse in a fresh database).
const CURATED_REQUIRED_CODES: Partial<Record<SchoolCode, string[]>> = {
  TUM: [
    "IN0006",
    "IN0007",
    "IN0010",
    "IN2001",
    "IN2022",
    "IN2064",
    "MA0901",
    "MA0902",
    "MA1008",
    "PH1007",
  ],
  LMU: [
    "IN0006",
    "IN2001",
    "MA0901",
    "MA0902",
  ],
};

export default async function CoursesPage({
  searchParams,
}: {
  searchParams?: Promise<{ school?: string; tab?: string; q?: string }>;
}) {
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const c = ui.courses;
  const sessionUser = await getSessionUser();
  const query = (await searchParams) ?? {};
  const servedCity = await getServerDiscoverServedCity();
  const allowedSchools = schoolCodesForDiscoverCity(servedCity);
  const schoolFallback =
    allowedSchools.includes(DEFAULT_SCHOOL) ? DEFAULT_SCHOOL : (allowedSchools[0] ?? DEFAULT_SCHOOL);
  const requestedSchool =
    normalizeSchoolCode(query.school) ??
    (sessionUser ? normalizeSchoolCode(sessionUser.school) : null) ??
    schoolFallback;
  const selectedSchool: SchoolCode =
    allowedSchools.length > 0 && !allowedSchools.includes(requestedSchool) ?
      schoolFallback
    : requestedSchool;
  const activeTab = normalizeCoursesTab(query.tab);
  const semesterLabel = getCurrentSemesterLabel();
  const rawCourseQuery = query.q?.trim() ?? "";
  const listReturnTo = coursesListReturnPath(activeTab, selectedSchool, rawCourseQuery);

  const popularWhere = {
    school: selectedSchool,
    semesterLabel,
    ...(rawCourseQuery
      ? {
          OR: [
            { code: { contains: rawCourseQuery.toUpperCase() } },
            { name: { contains: rawCourseQuery, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  let popularRows: CourseRow[];
  let popularSourceLabel = c.popularSubtitlePopularInSchool;

  if (rawCourseQuery) {
    const rows = await prisma.course.findMany({
      where: popularWhere,
      orderBy: [{ code: "asc" }, { name: "asc" }],
      take: 20,
    });
    const memberCountMap = await getCourseMemberCountMap(rows.map((course) => course.id));
    popularRows = rows.map((course) => ({
      id: course.id,
      code: course.code,
      name: course.name,
      instructorSummary: course.instructorSummary,
      memberCount: memberCountMap.get(course.id) ?? 0,
    }));
    popularSourceLabel = formatMessage(c.popularSubtitleResultsFor, { query: rawCourseQuery });
  } else {
    const seededCodes = CURATED_REQUIRED_CODES[selectedSchool] ?? [];
    const seededRowsRaw = seededCodes.length
      ? await prisma.course.findMany({
          where: {
            school: selectedSchool,
            semesterLabel,
            code: { in: seededCodes },
          },
        })
      : [];

    const seededByCode = new Map(
      seededRowsRaw
        .filter((r) => r.code)
        .map((r) => [r.code as string, r]),
    );

    const seededRowsOrdered = seededCodes
      .map((code) => seededByCode.get(code))
      .filter((r): r is (typeof seededRowsRaw)[number] => Boolean(r))
      .slice(0, 10);

    if (seededRowsOrdered.length > 0) {
      const memberCountMap = await getCourseMemberCountMap(
        seededRowsOrdered.map((course) => course.id),
      );
      popularRows = seededRowsOrdered.map((course) => ({
        id: course.id,
        code: course.code,
        name: course.name,
        instructorSummary: course.instructorSummary,
        memberCount: memberCountMap.get(course.id) ?? 0,
      }));
      popularSourceLabel = c.popularSubtitleRequiredCore;
    } else {
      const topMembershipCounts = await prisma.userCourse.groupBy({
        by: ["courseId"],
        where: {
          course: { school: selectedSchool, semesterLabel },
        },
        _count: { courseId: true },
        orderBy: { _count: { courseId: "desc" } },
        take: 10,
      });

      const orderedTopIds = topMembershipCounts.map((item) => item.courseId);
      const rows = orderedTopIds.length
        ? await prisma.course.findMany({
            where: { id: { in: orderedTopIds } },
          })
        : await prisma.course.findMany({
            where: { school: selectedSchool, semesterLabel },
            orderBy: [{ code: "asc" }, { name: "asc" }],
            take: 10,
          });

      const rowsById = new Map(rows.map((course) => [course.id, course]));
      const memberCountMap = new Map(
        topMembershipCounts.map((item) => [item.courseId, item._count.courseId]),
      );
      const orderedRows =
        orderedTopIds.length > 0
          ? orderedTopIds
              .map((id) => rowsById.get(id))
              .filter((course): course is (typeof rows)[number] => Boolean(course))
          : rows;

      popularRows = orderedRows.map((course) => ({
        id: course.id,
        code: course.code,
        name: course.name,
        instructorSummary: course.instructorSummary,
        memberCount: memberCountMap.get(course.id) ?? 0,
      }));
    }
  }

  if (!sessionUser) {
    const payload: CoursesPagePayload = {
      cacheUserId: "guest",
      signedIn: false,
      selectedSchool,
      allowedSchools,
      activeTab,
      rawCourseQuery,
      listReturnTo,
      popularRows,
      popularSourceLabel,
      memberships: [],
      savedPanelRows: [],
      recommendedClassmates: [],
    };
    return <CoursesPageClient initialPayload={payload} />;
  }

  const user = sessionUser;

  const [memberships, savedRows, recommendedClassmates] = await Promise.all([
    prisma.userCourse.findMany({
      where: {
        userId: user.id,
        course: { school: selectedSchool },
      },
      include: {
        course: {
          include: {
            _count: { select: { members: true } },
          },
        },
        sessions: {
          orderBy: [{ weekday: "asc" }, { startMinute: "asc" }],
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    prisma.savedCourse.findMany({
      where: {
        userId: user.id,
        course: { school: selectedSchool },
      },
      include: {
        course: {
          include: {
            _count: { select: { members: true } },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
    getRecommendedClassmatesForViewer(user.id),
  ]);

  const enrolledIds = new Set(memberships.map((m) => m.courseId));
  const savedIdSet = new Set(savedRows.map((s) => s.courseId));
  const popularRowsForViewer: CourseRow[] = popularRows.map((row) => ({
    ...row,
    viewerSaved: savedIdSet.has(row.id),
    viewerEnrolled: enrolledIds.has(row.id),
  }));
  const savedPanelRows = savedRows
    .filter((s) => !enrolledIds.has(s.courseId))
    .map((s) => ({
      savedId: s.id,
      courseId: s.courseId,
      code: s.course.code,
      name: s.course.name,
      memberCount: s.course._count.members,
    }));
  const membershipRows: EnrolledCourseRow[] = memberships.map((membership) => ({
    membershipId: membership.id,
    course: {
      id: membership.course.id,
      name: membership.course.name,
      code: membership.course.code,
      instructorSummary: membership.course.instructorSummary,
    },
    sessions: membership.sessions.map((s) => ({
      weekday: s.weekday,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      location: s.location,
    })),
    memberCount: membership.course._count.members,
  }));

  const payload: CoursesPagePayload = {
    cacheUserId: user.id,
    signedIn: true,
    selectedSchool,
    allowedSchools,
    activeTab,
    rawCourseQuery,
    listReturnTo,
    popularRows: popularRowsForViewer,
    popularSourceLabel,
    memberships: membershipRows,
    savedPanelRows,
    recommendedClassmates,
  };

  return <CoursesPageClient initialPayload={payload} />;
}


async function getCourseMemberCountMap(courseIds: string[]) {
  if (courseIds.length === 0) {
    return new Map<string, number>();
  }

  const grouped = await prisma.userCourse.groupBy({
    by: ["courseId"],
    where: { courseId: { in: courseIds } },
    _count: { courseId: true },
  });

  return new Map(grouped.map((item) => [item.courseId, item._count.courseId]));
}
