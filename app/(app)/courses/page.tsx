import type { Route } from "next";
import Link from "next/link";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { RecommendedClassmatesRail } from "@/components/classmates/recommended-classmates-rail";
import { CoursesSchoolSelect } from "@/components/courses/courses-school-select";
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
  getSchoolLabel,
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
import { cn } from "@/lib/utils";

type CoursesTab = "popular-courses" | "my-courses" | "my-bookmarked-courses";

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

const TAB_OPTIONS: CoursesTab[] = ["popular-courses", "my-courses", "my-bookmarked-courses"];

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

function normalizeTab(raw?: string): CoursesTab {
  return TAB_OPTIONS.includes(raw as CoursesTab) ? (raw as CoursesTab) : "popular-courses";
}

function coursesTabHref(tab: CoursesTab, school: SchoolCode, q?: string): Route {
  const params = new URLSearchParams({ school, tab });
  if (q && q.trim()) params.set("q", q.trim());
  return `/courses?${params.toString()}` as Route;
}

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
  const activeTab = normalizeTab(query.tab);
  const semesterLabel = getCurrentSemesterLabel();
  const rawCourseQuery = query.q?.trim() ?? "";

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
      <div className="space-y-3 pb-4">
        <CoursesHeader
          selectedSchool={selectedSchool}
          allowedSchools={allowedSchools}
          courses={c}
        />
        <CoursesEntryTabs activeTab={activeTab} selectedSchool={selectedSchool} query={rawCourseQuery} courses={c} />

        {activeTab === "popular-courses" ? (
          <>
            <PopularCoursesSearchBar selectedSchool={selectedSchool} query={rawCourseQuery} courses={c} />
            <PopularCoursesMeta subtitle={popularSourceLabel} count={popularRows.length} courses={c} />
            <CourseRowsList rows={popularRows} query={rawCourseQuery} emptyText={c.emptyNoCourses} courses={c} />
            <GuestAppCta
              returnTo="/courses"
              headline={c.guestManageHeadline}
              body={c.guestManageBodyPopular}
            />
          </>
        ) : (
          <GuestAppCta
            returnTo={coursesTabHref(activeTab, selectedSchool, rawCourseQuery)}
            headline={c.guestManageHeadline}
            body={c.guestManageBodyBookmarksTabs}
          />
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
    <div className="space-y-3 pb-4">
      <CoursesHeader
        selectedSchool={selectedSchool}
        allowedSchools={allowedSchools}
        courses={c}
      />
      <CoursesEntryTabs activeTab={activeTab} selectedSchool={selectedSchool} query={rawCourseQuery} courses={c} />

      <RecommendedClassmatesRail
        rows={recommendedClassmates}
        title={c.recommendedClassmatesTitle}
        returnTo="/courses"
      />

      {activeTab === "popular-courses" ? (
        <>
          <PopularCoursesSearchBar selectedSchool={selectedSchool} query={rawCourseQuery} courses={c} />
          <PopularCoursesMeta subtitle={popularSourceLabel} count={popularRows.length} courses={c} />
          <CourseRowsList rows={popularRowsForViewer} query={rawCourseQuery} emptyText={c.emptyNoCourses} courses={c} />
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
        <SavedCoursesPanel initialSaved={savedPanelRows} school={selectedSchool} />
      ) : null}
    </div>
  );
}

function CoursesHeader({
  selectedSchool,
  allowedSchools,
  courses,
}: {
  selectedSchool: SchoolCode;
  allowedSchools: SchoolCode[];
  courses: CoursesMessages;
}) {
  const schoolLabel = getSchoolLabel(selectedSchool);
  return (
    <div className="flex items-start justify-between gap-3">
      <header className="min-w-0">
        <h1 className="page-screen-title">{courses.screenTitle}</h1>
        <p className="page-screen-subtitle mt-0.5">{courses.screenSubtitle}</p>
      </header>

      <div className="shrink-0 space-y-1">
        <p className="px-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-[#8A94A6] dark:text-muted-foreground">
          {courses.schoolHeading}
        </p>
        <CoursesSchoolSelect
          value={selectedSchool}
          allowedSchools={allowedSchools.length > 0 ? allowedSchools : undefined}
          className="w-auto max-w-[11.5rem]"
        />
        <p className="sr-only">{formatMessage(courses.schoolSelectSrSuffix, { school: schoolLabel })}</p>
      </div>
    </div>
  );
}

function CoursesEntryTabs({
  activeTab,
  selectedSchool,
  query,
  courses,
}: {
  activeTab: CoursesTab;
  selectedSchool: SchoolCode;
  query: string;
  courses: CoursesMessages;
}) {
  const base =
    "inline-flex h-9 w-full items-center justify-center rounded-full border px-2 text-[12px] font-semibold transition";

  const tabClass = (tab: CoursesTab) =>
    cn(
      base,
      activeTab === tab
        ? "border-[#2563EB]/30 bg-[#EFF6FF] text-[#1D4ED8]"
        : "border-[#D8D1C7] bg-white text-[#111827] shadow-sm hover:bg-[#F8F6F1] dark:border-border dark:bg-card dark:text-foreground dark:hover:bg-muted/45",
    );

  return (
    <nav aria-label={courses.tabsNavAria} className="grid grid-cols-3 items-center gap-2">
      <Link href={coursesTabHref("popular-courses", selectedSchool, query)} className={tabClass("popular-courses")}>
        {courses.tabPopular}
      </Link>
      <Link href={coursesTabHref("my-courses", selectedSchool, query)} className={tabClass("my-courses")}>
        {courses.tabMyCourses}
      </Link>
      <Link
        href={coursesTabHref("my-bookmarked-courses", selectedSchool, query)}
        className={tabClass("my-bookmarked-courses")}
      >
        {courses.tabBookmarks}
      </Link>
    </nav>
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
}: {
  rows: CourseRow[];
  query: string;
  emptyText: string;
  courses: CoursesMessages;
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
