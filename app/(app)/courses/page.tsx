import type { Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { CourseSearchSurface } from "@/components/courses/course-search-surface";
import {
  EnrolledCourseCard,
  type EnrolledSession,
} from "@/components/courses/enrolled-course-card";
import {
  SavedCoursesPanel,
  type SavedRow,
} from "@/components/courses/saved-courses-panel";
import { EmptyState } from "@/components/ui/empty-state";
import { LinkButton } from "@/components/ui/link-button";
import { getSessionUser } from "@/lib/auth/session";
import {
  DEFAULT_SCHOOL,
  getSchoolLabel,
  normalizeSchoolCode,
  schoolOptions,
} from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";

/**
 * /courses is the course-finding surface of the app.
 *
 * The core user flow is "find classmates through the courses I take", which
 * makes course search the single most important action on this page. It lives
 * at the top as a tall, prominent input (`CourseSearchSurface`) and when
 * active it covers the idle content below.
 *
 * Idle content, below the search:
 *   - ENROLLED — rich cards with the weekly schedule, tapping opens the
 *     course detail page where the classmate list lives.
 *   - SAVED    — compact bookmark rows, each with quick Enroll / Remove.
 */
export default async function CoursesPage({
  searchParams,
}: {
  searchParams?: Promise<{ school?: string }>;
}) {
  const sessionUser = await getSessionUser();
  const query = (await searchParams) ?? {};
  const selectedSchool =
    normalizeSchoolCode(query.school) ??
    (sessionUser?.onboardingComplete ? normalizeSchoolCode(sessionUser.school) : null) ??
    DEFAULT_SCHOOL;

  if (!sessionUser) {
    return (
      <div className="space-y-5 pb-4">
        <CoursesHeader selectedSchool={selectedSchool} />
        <CourseSearchSurface guestMode school={selectedSchool}>
          <div className="space-y-4">
            <GuestAppCta
              returnTo="/courses"
              headline="Sign in to manage your courses"
              body="You can search the catalog below. Saving, enrolling, and your schedule sync after you log in."
            />
          </div>
        </CourseSearchSurface>
      </div>
    );
  }
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
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

  // Saved rows that are already enrolled shouldn't appear in the saved panel
  // — that would present the viewer with a "tap Enroll" on a course they're
  // already enrolled in.
  const enrolledIds = new Set(memberships.map((m) => m.courseId));
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
    <div className="space-y-5 pb-4">
      <CoursesHeader selectedSchool={selectedSchool} />

      <CourseSearchSurface school={selectedSchool}>
        <div className="space-y-5">
          <section className="space-y-2.5">
            <div className="flex items-baseline justify-between px-1">
              <h2 className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">
                Enrolled
              </h2>
              {memberships.length > 0 ? (
                <p className="text-[11px] text-muted-foreground/80">
                  {memberships.length}{" "}
                  {memberships.length === 1 ? "course" : "courses"}
                </p>
              ) : null}
            </div>

            {memberships.length === 0 ? (
              <EmptyState
                title="No courses on your schedule yet"
                description="Search for a course above, or jump straight to the full add-with-times form."
                action={
                  <LinkButton href={"/courses/add" as Route} size="sm">
                    Open add form
                  </LinkButton>
                }
              />
            ) : (
              <ul className="space-y-2">
                {memberships.map((membership) => {
                  const sessions: EnrolledSession[] = membership.sessions.map(
                    (s) => ({
                      weekday: s.weekday,
                      startMinute: s.startMinute,
                      endMinute: s.endMinute,
                      location: s.location,
                    }),
                  );
                  return (
                    <li key={membership.id}>
                      <EnrolledCourseCard
                        course={{
                          id: membership.course.id,
                          name: membership.course.name,
                          code: membership.course.code,
                        }}
                        sessions={sessions}
                        memberCount={membership.course._count.members}
                      />
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <SavedCoursesPanel initialSaved={savedPanelRows} />
        </div>
      </CourseSearchSurface>
    </div>
  );
}

function CoursesHeader({ selectedSchool }: { selectedSchool: string }) {
  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h1 className="text-[22px] font-semibold leading-tight tracking-tight">Courses</h1>
        <p className="text-[13px] leading-snug text-muted-foreground">
          Each school has its own catalog. Switch below to search and manage enrollments for that
          school only (separate from your profile school).
        </p>
      </div>

      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {schoolOptions.map((school) => {
          const active = school.value === selectedSchool;
          return (
            <Link
              key={school.value}
              href={`/courses?school=${encodeURIComponent(school.value)}` as Route}
              className={
                active
                  ? "inline-flex h-10 shrink-0 items-center rounded-full border border-primary/40 bg-primary/10 px-3.5 text-[13px] font-medium text-primary"
                  : "inline-flex h-10 shrink-0 items-center rounded-full border border-border/70 bg-card px-3.5 text-[13px] font-medium text-foreground/80"
              }
            >
              {school.shortLabel}
            </Link>
          );
        })}
      </div>
      <p className="text-[11px] text-muted-foreground/90">
        Showing: <span className="font-medium text-foreground">{getSchoolLabel(selectedSchool)}</span>{" "}
        · Enrolled &amp; saved lists match this tab.
      </p>
    </div>
  );
}
