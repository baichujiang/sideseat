import type { Route } from "next";
import Link from "next/link";

import { RecommendedClassmatesRail } from "@/components/classmates/recommended-classmates-rail";
import { CoursesPageTop } from "@/components/courses/courses-page-top";
import { CoursesTabRestore } from "@/components/courses/courses-tab-restore";
import { inboxChatListUlClassName } from "@/components/inbox/inbox-conversation-tile";
import {
  EnrolledCourseCard,
  type EnrolledSession,
} from "@/components/courses/enrolled-course-card";
import { PopularCourseCard } from "@/components/courses/popular-course-card";
import {
  SavedCoursesPanel,
  type SavedRow,
} from "@/components/courses/saved-courses-panel";
import { LinkButton } from "@/components/ui/link-button";
import { getSessionUser } from "@/lib/auth/session";
import {
  DEFAULT_SCHOOL,
  normalizeSchoolCode,
  type SchoolCode,
} from "@/lib/constants/schools";
import { getCurrentSemesterLabel } from "@/lib/constants/semester";
import { prisma } from "@/lib/db/prisma";
import { formatMessage, getMessages, type CoursesMessages } from "@/lib/i18n/messages";
import { schoolCodesForDiscoverCity } from "@/lib/discover/city-school-scope";
import { getServerDiscoverServedCity } from "@/lib/discover/discover-city-preference";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { getRecommendedClassmatesForViewer } from "@/lib/queries/recommended-classmates";
import {
  coursesListReturnPath,
  coursesTabHref,
  normalizeCoursesTab,
} from "@/lib/courses/courses-tab";
import { cn } from "@/lib/utils";

type CourseRow = {
  id: string;
  code: string | null;
  name: string;
  instructorSummary: string | null;
  memberCount: number;
  /** Set when the viewer is signed in (Popular tab). */
  viewerSaved?: boolean;
  viewerEnrolled?: boolean;
};

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
    return (
      <div className="space-y-4 pb-4">
        <CoursesTabRestore />
        <CoursesPageTop
          selectedSchool={selectedSchool}
          allowedSchools={allowedSchools}
          activeTab={activeTab}
          query={rawCourseQuery}
          courses={c}
        />

        {activeTab === "popular-courses" ? (
          <>
            <PopularCoursesSearchBar selectedSchool={selectedSchool} query={rawCourseQuery} courses={c} />
            <PopularCoursesMeta subtitle={popularSourceLabel} count={popularRows.length} courses={c} />
            <CourseRowsList
              rows={popularRows}
              query={rawCourseQuery}
              emptyText={c.emptyNoCourses}
              courses={c}
              listReturnTo={listReturnTo}
            />
          </>
        ) : (
          <p className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-[14px] text-muted-foreground">
            {c.guestManageBodyBookmarksTabs}
          </p>
        )}
      </div>
    );
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
  const savedPanelRows: SavedRow[] = savedRows
    .filter((s) => !enrolledIds.has(s.courseId))
    .map((s) => ({
      savedId: s.id,
      courseId: s.courseId,
      code: s.course.code,
      name: s.course.name,
      memberCount: s.course._count.members,
    }));

  return (
    <div className="space-y-4 pb-4">
      <CoursesTabRestore />
      <CoursesPageTop
        selectedSchool={selectedSchool}
        allowedSchools={allowedSchools}
        activeTab={activeTab}
        query={rawCourseQuery}
        courses={c}
      />

      <RecommendedClassmatesRail
        rows={recommendedClassmates}
        title={c.recommendedClassmatesTitle}
        returnTo={listReturnTo}
      />

      {activeTab === "popular-courses" ? (
        <>
          <PopularCoursesSearchBar selectedSchool={selectedSchool} query={rawCourseQuery} courses={c} />
          <PopularCoursesMeta subtitle={popularSourceLabel} count={popularRows.length} courses={c} />
          <CourseRowsList
            rows={popularRowsForViewer}
            query={rawCourseQuery}
            emptyText={c.emptyNoCourses}
            courses={c}
            listReturnTo={listReturnTo}
          />
        </>
      ) : null}

      {activeTab === "my-courses" ? (
        memberships.length === 0 ? (
          <div
            className={cn(
              "rounded-[1.25rem] border border-dashed border-[#D8D1C7] bg-[#FCFBF8] px-6 py-8 text-center",
              "dark:border-border dark:bg-muted/20",
            )}
          >
            <h3 className="text-lg font-semibold tracking-tight text-[#111827] dark:text-foreground">
              {c.myCoursesEmptyTitle}
            </h3>
            <p className="mx-auto mt-2 max-w-[22rem] text-[14px] leading-relaxed text-[#5F6B7A] dark:text-muted-foreground">
              {c.myCoursesEmptyBody}
            </p>
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              <Link
                href={coursesTabHref("popular-courses", selectedSchool, rawCourseQuery)}
                className={cn(
                  "inline-flex rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2 text-sm font-semibold text-[#2563EB] transition",
                  "hover:bg-[#DBEAFE] dark:border-blue-500/40 dark:bg-blue-950/35 dark:text-blue-300",
                )}
              >
                {c.browsePopularCourses}
              </Link>
              <LinkButton href={"/courses/add" as Route} variant="outline" size="sm" className="rounded-full">
                {c.addWithForm}
              </LinkButton>
            </div>
          </div>
        ) : (
          <ul className={inboxChatListUlClassName}>
            {memberships.map((membership) => {
              const sessions: EnrolledSession[] = membership.sessions.map((s) => ({
                weekday: s.weekday,
                startMinute: s.startMinute,
                endMinute: s.endMinute,
                location: s.location,
              }));
              return (
                <li key={membership.id} className="list-none">
                  <EnrolledCourseCard
                    variant="compact"
                    courses={c}
                    listReturnTo={listReturnTo}
                    course={{
                      id: membership.course.id,
                      name: membership.course.name,
                      code: membership.course.code,
                      instructorSummary: membership.course.instructorSummary,
                    }}
                    sessions={sessions}
                    memberCount={membership.course._count.members}
                  />
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {activeTab === "my-bookmarked-courses" ? (
        <SavedCoursesPanel
          initialSaved={savedPanelRows}
          school={selectedSchool}
          listReturnTo={listReturnTo}
        />
      ) : null}
    </div>
  );
}


function PopularCoursesSearchBar({
  selectedSchool,
  query,
  courses,
}: {
  selectedSchool: SchoolCode;
  query: string;
  courses: CoursesMessages;
}) {
  return (
    <form
      method="get"
      action="/courses"
      className={cn(
        "flex items-center gap-2 rounded-[1.1rem] border border-[#E7E0D6] bg-white px-3 py-2.5",
        "dark:border-border dark:bg-card",
      )}
    >
      <input type="hidden" name="school" value={selectedSchool} />
      <input type="hidden" name="tab" value="popular-courses" />
      <input
        name="q"
        defaultValue={query}
        placeholder={courses.searchPlaceholder}
        className="h-9 flex-1 rounded-xl border border-[#E7E0D6] bg-background px-3 text-[14px] outline-none focus-visible:border-[#2563EB]/55 dark:border-border"
      />
      <button
        type="submit"
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[#D8D1C7] bg-white px-3 text-[12px] font-semibold text-[#111827] transition hover:bg-[#F8F6F1] dark:border-border dark:bg-card dark:text-foreground"
      >
        {courses.searchSubmit}
      </button>
      {query ? (
        <Link
          href={coursesTabHref("popular-courses", selectedSchool)}
          className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-transparent px-2.5 text-[12px] font-medium text-muted-foreground transition hover:bg-muted/40 hover:text-foreground"
        >
          {courses.searchClear}
        </Link>
      ) : null}
    </form>
  );
}

function PopularCoursesMeta({
  subtitle,
  count,
  courses,
}: {
  subtitle: string;
  count: number;
  courses: CoursesMessages;
}) {
  return (
    <div className="flex items-center justify-between px-1 text-[12px] text-[#5F6B7A] dark:text-muted-foreground">
      <span>{subtitle}</span>
      <span>{formatMessage(courses.metaCourseCount, { count })}</span>
    </div>
  );
}

function CourseRowsList({
  rows,
  query,
  emptyText,
  courses,
  listReturnTo,
}: {
  rows: CourseRow[];
  query: string;
  emptyText: string;
  courses: CoursesMessages;
  listReturnTo: string;
}) {
  if (rows.length === 0) {
    return (
      <div
        className={cn(
          "rounded-[1.25rem] border border-dashed border-[#D8D1C7] bg-[#FCFBF8] px-6 py-8 text-center",
          "dark:border-border dark:bg-muted/20",
        )}
      >
        <p className="text-[14px] font-medium text-[#111827] dark:text-foreground">
          {query ? formatMessage(courses.emptyNoMatchQuery, { query }) : emptyText}
        </p>
      </div>
    );
  }

  return (
    <ul className={inboxChatListUlClassName}>
      {rows.map((row) => (
        <li key={row.id} className="list-none">
          <PopularCourseCard
            variant="compact"
            courses={courses}
            listReturnTo={listReturnTo}
            course={{
              id: row.id,
              name: row.name,
              code: row.code,
              instructorSummary: row.instructorSummary,
            }}
            memberCount={row.memberCount}
            viewer={
              row.viewerSaved !== undefined && row.viewerEnrolled !== undefined
                ? { saved: row.viewerSaved, enrolled: row.viewerEnrolled }
                : null
            }
          />
        </li>
      ))}
    </ul>
  );
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
