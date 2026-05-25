import {
  CoursesPageClient,
  type CourseRow,
  type CoursesPagePayload,
  type EnrolledCourseRow,
} from "@/components/courses/courses-page-client";
import type { Prisma } from "@prisma/client";
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
import {
  coursesListReturnPath,
  normalizeCoursesTab,
} from "@/lib/courses/courses-tab";

type CuratedPopularCoursePick = {
  code?: string;
  name: string;
  aliases?: string[];
};

// Curated popular defaults shown only when local enrollment/member counts do
// not exist yet. TUM picks use public TUM module pages; LMU picks use public
// LMU Informatik course/module listings for recurring high-demand CS topics.
const CURATED_POPULAR_DEFAULT_PICKS: Partial<Record<SchoolCode, CuratedPopularCoursePick[]>> = {
  TUM: [
    { code: "IN2064", name: "Machine Learning" },
    { code: "IN2346", name: "Introduction to Deep Learning" },
    { code: "IN2003", name: "Efficient Algorithms and Data Structures", aliases: ["Algorithms"] },
    { code: "IN2031", name: "Application and Implementation of Database Systems", aliases: ["Databases"] },
    { code: "IN2375", name: "Computer Vision" },
    { code: "IN0006", name: "Introduction to Software Engineering" },
    { code: "IN2361", name: "Natural Language Processing" },
    { code: "IN2073", name: "Cloud Computing" },
    { code: "IN2030", name: "Data Mining and Knowledge Discovery", aliases: ["Data Mining und Knowledge Discovery"] },
    { code: "IN2017", name: "Computer Graphics", aliases: ["Computer Grafik"] },
  ],
  LMU: [
    { name: "Machine Learning", aliases: ["Maschinelles Lernen", "Grundlagen des Maschinellen Lernens"] },
    { name: "Deep Learning and Artificial Intelligence", aliases: ["Deep Learning", "Künstliche Intelligenz"] },
    { name: "Data Mining Algorithms I", aliases: ["Data Mining Algorithmen I"] },
    { name: "Datenbanksysteme", aliases: ["Database Systems"] },
    { name: "Softwaretechnik", aliases: ["Software Engineering", "Methods in Software Engineering"] },
    { name: "Algorithmen und Datenstrukturen", aliases: ["Algorithms and Data Structures"] },
    { name: "Computer Vision: Image and Video Understanding", aliases: ["Computer Vision"] },
    { name: "Computational Intelligence" },
    { name: "Intelligent Systems", aliases: ["Intelligente Systeme"] },
    { name: "Algorithm Design" },
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
    const topMembershipCounts = await prisma.userCourse.groupBy({
      by: ["courseId"],
      where: {
        course: { school: selectedSchool, semesterLabel },
      },
      _count: { courseId: true },
      orderBy: { _count: { courseId: "desc" } },
      take: 10,
    });

    if (topMembershipCounts.length > 0) {
      const orderedTopIds = topMembershipCounts.map((item) => item.courseId);
      const rows = await prisma.course.findMany({
        where: { id: { in: orderedTopIds } },
      });

      const rowsById = new Map(rows.map((course) => [course.id, course]));
      const memberCountMap = new Map(
        topMembershipCounts.map((item) => [item.courseId, item._count.courseId]),
      );
      const orderedRows = orderedTopIds
        .map((id) => rowsById.get(id))
        .filter((course): course is (typeof rows)[number] => Boolean(course));

      popularRows = orderedRows.map((course) => ({
        id: course.id,
        code: course.code,
        name: course.name,
        instructorSummary: course.instructorSummary,
        memberCount: memberCountMap.get(course.id) ?? 0,
      }));
    } else {
      const defaultRows = await getCuratedPopularDefaultRows(selectedSchool, semesterLabel);
      popularRows = defaultRows.map((course) => ({
        id: course.id,
        code: course.code,
        name: course.name,
        instructorSummary: course.instructorSummary,
        memberCount: 0,
      }));
      popularSourceLabel = c.popularSubtitlePopularPicks;
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
    };
    return <CoursesPageClient initialPayload={payload} />;
  }

  const user = sessionUser;

  const [memberships, savedRows] = await Promise.all([
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

async function getCuratedPopularDefaultRows(school: SchoolCode, semesterLabel: string) {
  const picks = CURATED_POPULAR_DEFAULT_PICKS[school] ?? [];
  if (picks.length === 0) {
    return [];
  }

  const codeFilters = picks
    .map((pick) => pick.code)
    .filter((code): code is string => Boolean(code));
  const nameFilters = Array.from(
    new Set(picks.flatMap((pick) => [pick.name, ...(pick.aliases ?? [])])),
  ).filter((name) => name.trim().length > 0);
  const orFilters: Prisma.CourseWhereInput[] = [
    ...codeFilters.map((code) => ({ code })),
    ...nameFilters.map((name) => ({ name: { contains: name, mode: "insensitive" as const } })),
  ];

  if (orFilters.length === 0) {
    return [];
  }

  const rows = await prisma.course.findMany({
    where: {
      school,
      semesterLabel,
      OR: orFilters,
    },
    orderBy: [{ code: "asc" }, { name: "asc" }],
  });

  const selected = new Set<string>();
  return picks
    .map((pick) => {
      const match = rows
        .filter((row) => !selected.has(row.id) && courseMatchesCuratedPick(row, pick))
        .sort((a, b) => coursePickScore(a, pick) - coursePickScore(b, pick))[0];
      if (match) {
        selected.add(match.id);
      }
      return match;
    })
    .filter((row): row is (typeof rows)[number] => Boolean(row))
    .slice(0, 10);
}

function courseMatchesCuratedPick(
  course: { code: string | null; name: string },
  pick: CuratedPopularCoursePick,
) {
  if (pick.code && course.code === pick.code) {
    return true;
  }

  const normalizedName = course.name.toLowerCase();
  return curatedPickNameTerms(pick).some((term) => normalizedName.includes(term.toLowerCase()));
}

function coursePickScore(
  course: { code: string | null; name: string },
  pick: CuratedPopularCoursePick,
) {
  if (pick.code && course.code === pick.code) {
    return 0;
  }

  const normalizedName = course.name.toLowerCase();
  const terms = curatedPickNameTerms(pick).map((term) => term.toLowerCase());
  if (terms.some((term) => normalizedName === term)) {
    return 1;
  }
  if (terms.some((term) => normalizedName.startsWith(term))) {
    return 2;
  }
  return 3 + course.name.length / 1000;
}

function curatedPickNameTerms(pick: CuratedPopularCoursePick) {
  return [pick.name, ...(pick.aliases ?? [])];
}
