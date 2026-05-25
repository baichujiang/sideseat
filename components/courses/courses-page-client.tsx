"use client";

import Link from "next/link";
import type { Route } from "next";
import type { Weekday } from "@prisma/client";
import { useEffect, useState } from "react";

import { CoursesPageTop } from "@/components/courses/courses-page-top";
import { CoursesTabRestore } from "@/components/courses/courses-tab-restore";
import { EnrolledCourseCard, type EnrolledSession } from "@/components/courses/enrolled-course-card";
import { PopularCourseCard } from "@/components/courses/popular-course-card";
import { SavedCoursesPanel, type SavedRow } from "@/components/courses/saved-courses-panel";
import { inboxChatListUlClassName } from "@/components/inbox/inbox-conversation-tile";
import { LinkButton } from "@/components/ui/link-button";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { useOnlineStatus } from "@/hooks/use-online-status";
import type { SchoolCode } from "@/lib/constants/schools";
import type { CoursesTab } from "@/lib/courses/courses-tab";
import { coursesTabHref } from "@/lib/courses/courses-tab";
import { formatMessage, type CoursesMessages } from "@/lib/i18n/messages";
import { cn } from "@/lib/utils";

export type CourseRow = {
  id: string;
  code: string | null;
  name: string;
  instructorSummary: string | null;
  memberCount: number;
  viewerSaved?: boolean;
  viewerEnrolled?: boolean;
};

export type EnrolledCourseRow = {
  membershipId: string;
  course: {
    id: string;
    name: string;
    code: string | null;
    instructorSummary: string | null;
  };
  sessions: Array<{
    weekday: Weekday;
    startMinute: number;
    endMinute: number;
    location: string | null;
  }>;
  memberCount: number;
};

export type CoursesPagePayload = {
  cacheUserId: string;
  signedIn: boolean;
  selectedSchool: SchoolCode;
  allowedSchools: SchoolCode[];
  activeTab: CoursesTab;
  rawCourseQuery: string;
  listReturnTo: string;
  popularRows: CourseRow[];
  popularSourceLabel: string;
  memberships: EnrolledCourseRow[];
  savedPanelRows: SavedRow[];
};

type CoursesPageCacheRecord = {
  version: 1;
  payload: CoursesPagePayload;
  fetchedAt: number;
};

const COURSES_PAGE_STORAGE_PREFIX = "sideseat:coursesPage:v1:";

function cacheKey(payload: Pick<CoursesPagePayload, "cacheUserId" | "selectedSchool" | "activeTab" | "rawCourseQuery">) {
  return [
    COURSES_PAGE_STORAGE_PREFIX,
    encodeURIComponent(payload.cacheUserId),
    ":",
    encodeURIComponent(payload.selectedSchool),
    ":",
    encodeURIComponent(payload.activeTab),
    ":",
    encodeURIComponent(payload.rawCourseQuery),
  ].join("");
}

function readCoursesCache(key: string): CoursesPagePayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<CoursesPageCacheRecord>;
    if (parsed.version !== 1 || !parsed.payload) return null;
    return parsed.payload;
  } catch {
    return null;
  }
}

function writeCoursesCache(payload: CoursesPagePayload) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(
      cacheKey(payload),
      JSON.stringify({ version: 1, payload, fetchedAt: Date.now() } satisfies CoursesPageCacheRecord),
    );
  } catch {
    // Storage can be unavailable; the current server-rendered page still works.
  }
}

export function CoursesPageClient({ initialPayload }: { initialPayload: CoursesPagePayload }) {
  const isOnline = useOnlineStatus();
  const { messages } = useLocaleContext();
  const c = messages.courses;
  const [cachedPayload, setCachedPayload] = useState<CoursesPagePayload | null>(null);

  useEffect(() => {
    writeCoursesCache(initialPayload);
    setCachedPayload(null);
  }, [initialPayload]);

  useEffect(() => {
    if (isOnline) {
      setCachedPayload(null);
      return;
    }
    setCachedPayload(readCoursesCache(cacheKey(initialPayload)));
  }, [initialPayload, isOnline]);

  const payload = cachedPayload ?? initialPayload;
  const readOnly = !isOnline;

  return (
    <div className="space-y-4 pb-4">
      {!readOnly ? <CoursesTabRestore /> : null}
      <CoursesPageTop
        selectedSchool={payload.selectedSchool}
        allowedSchools={payload.allowedSchools}
        activeTab={payload.activeTab}
        query={payload.rawCourseQuery}
        courses={c}
        readOnly={readOnly}
      />

      {readOnly ? (
        <p className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3 py-2 text-[13px] text-amber-950 dark:border-amber-400/25 dark:bg-amber-950/25 dark:text-amber-100">
          {messages.offline.coursesReadOnlyNotice}
        </p>
      ) : null}

      {payload.activeTab === "popular-courses" ? (
        <>
          <PopularCoursesSearchBar
            selectedSchool={payload.selectedSchool}
            query={payload.rawCourseQuery}
            courses={c}
            readOnly={readOnly}
          />
          <PopularCoursesMeta subtitle={payload.popularSourceLabel} count={payload.popularRows.length} courses={c} />
          <CourseRowsList
            rows={payload.popularRows}
            query={payload.rawCourseQuery}
            emptyText={c.emptyNoCourses}
            courses={c}
            listReturnTo={payload.listReturnTo}
            readOnly={readOnly}
          />
        </>
      ) : null}

      {!payload.signedIn && payload.activeTab !== "popular-courses" ? (
        <p className="rounded-2xl border border-dashed border-border/70 bg-muted/20 px-4 py-6 text-center text-[14px] text-muted-foreground">
          {c.guestManageBodyBookmarksTabs}
        </p>
      ) : null}

      {payload.signedIn && payload.activeTab === "my-courses" ? (
        payload.memberships.length === 0 ? (
          <MyCoursesEmpty
            selectedSchool={payload.selectedSchool}
            rawCourseQuery={payload.rawCourseQuery}
            courses={c}
            readOnly={readOnly}
          />
        ) : (
          <ul className={inboxChatListUlClassName}>
            {payload.memberships.map((membership) => {
              const sessions: EnrolledSession[] = membership.sessions.map((s) => ({
                weekday: s.weekday,
                startMinute: s.startMinute,
                endMinute: s.endMinute,
                location: s.location,
              }));
              return (
                <li key={membership.membershipId} className="list-none">
                  <EnrolledCourseCard
                    variant="compact"
                    courses={c}
                    listReturnTo={payload.listReturnTo}
                    course={membership.course}
                    sessions={sessions}
                    memberCount={membership.memberCount}
                    readOnly={readOnly}
                  />
                </li>
              );
            })}
          </ul>
        )
      ) : null}

      {payload.signedIn && payload.activeTab === "my-bookmarked-courses" ? (
        <SavedCoursesPanel
          initialSaved={payload.savedPanelRows}
          school={payload.selectedSchool}
          listReturnTo={payload.listReturnTo}
          readOnly={readOnly}
        />
      ) : null}
    </div>
  );
}

function MyCoursesEmpty({
  selectedSchool,
  rawCourseQuery,
  courses,
  readOnly,
}: {
  selectedSchool: SchoolCode;
  rawCourseQuery: string;
  courses: CoursesMessages;
  readOnly: boolean;
}) {
  return (
    <div
      className={cn(
        "rounded-[1.25rem] border border-dashed border-[#D8D1C7] bg-[#FCFBF8] px-6 py-8 text-center",
        "dark:border-border dark:bg-muted/20",
      )}
    >
      <h3 className="text-lg font-semibold tracking-tight text-[#111827] dark:text-foreground">
        {courses.myCoursesEmptyTitle}
      </h3>
      <p className="mx-auto mt-2 max-w-[22rem] text-[14px] leading-relaxed text-[#5F6B7A] dark:text-muted-foreground">
        {courses.myCoursesEmptyBody}
      </p>
      {!readOnly ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          <Link
            href={coursesTabHref("popular-courses", selectedSchool, rawCourseQuery)}
            className={cn(
              "inline-flex rounded-full border border-[#BFDBFE] bg-[#EFF6FF] px-4 py-2 text-sm font-semibold text-[#2563EB] transition",
              "hover:bg-[#DBEAFE] dark:border-blue-500/40 dark:bg-blue-950/35 dark:text-blue-300",
            )}
          >
            {courses.browsePopularCourses}
          </Link>
          <LinkButton href={"/courses/add" as Route} variant="outline" size="sm" className="rounded-full">
            {courses.addWithForm}
          </LinkButton>
        </div>
      ) : null}
    </div>
  );
}

function PopularCoursesSearchBar({
  selectedSchool,
  query,
  courses,
  readOnly,
}: {
  selectedSchool: SchoolCode;
  query: string;
  courses: CoursesMessages;
  readOnly: boolean;
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
        disabled={readOnly}
        className="h-9 flex-1 rounded-xl border border-[#E7E0D6] bg-background px-3 text-[14px] outline-none focus-visible:border-[#2563EB]/55 disabled:cursor-not-allowed disabled:opacity-65 dark:border-border"
      />
      <button
        type="submit"
        disabled={readOnly}
        className="inline-flex h-9 shrink-0 items-center justify-center rounded-full border border-[#D8D1C7] bg-white px-3 text-[12px] font-semibold text-[#111827] transition hover:bg-[#F8F6F1] disabled:cursor-not-allowed disabled:opacity-65 dark:border-border dark:bg-card dark:text-foreground"
      >
        {courses.searchSubmit}
      </button>
      {query && !readOnly ? (
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
  readOnly,
}: {
  rows: CourseRow[];
  query: string;
  emptyText: string;
  courses: CoursesMessages;
  listReturnTo: string;
  readOnly: boolean;
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
            readOnly={readOnly}
          />
        </li>
      ))}
    </ul>
  );
}
