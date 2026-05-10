import Link from "next/link";
import type { Route } from "next";
import type { Weekday } from "@prisma/client";
import { addDays, subDays } from "date-fns";
import { GuestAppCta } from "@/components/app/guest-app-cta";
import { OnboardingContinueCta } from "@/components/app/onboarding-continue-cta";
import { HomeHero } from "@/components/home/home-hero";
import {
  ScheduleSurface,
  type ClassBlock,
  type StudyEntry,
} from "@/components/home/schedule-surface";
import { isCalendarCourseMirrorRow } from "@/lib/calendar/calendar-course-mirror";
import { ensureUserCalendarCategories } from "@/lib/calendar/default-user-calendar-categories";
import { getClassScheduleDateRange } from "@/lib/constants/vorlesungszeit";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const WEEKDAY_BY_JS: Record<number, Weekday> = {
  0: "SUN",
  1: "MON",
  2: "TUE",
  3: "WED",
  4: "THU",
  5: "FRI",
  6: "SAT",
};

/** One-off calendar rows shown on Home — recurring courses are computed separately. */
const CALENDAR_WINDOW_PAST_DAYS = 90;
const CALENDAR_WINDOW_FUTURE_DAYS = 180;

export default async function HomePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    const now = new Date();
    const semesterRange = getClassScheduleDateRange({ school: null, now });
    return (
      <div className="flex min-h-0 flex-1 flex-col">
        <HomeHero nickname={null} avatarUrl={null} nowDate={now} />
        <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
          <ScheduleSurface
            classBlocks={[]}
            studyEntries={[]}
            companionOptions={[]}
            initialCalendarCategories={[]}
            nowISO={now.toISOString()}
            semesterStartISO={semesterRange.start.toISOString()}
            semesterEndISO={semesterRange.end.toISOString()}
          />
          <GuestAppCta
            returnTo="/home"
            headline="Sign in to build your schedule"
            body="Add courses and study blocks — they sync once you have an account."
          />
        </div>
      </div>
    );
  }
  const user = sessionUser;
  const now = new Date();
  const semesterRange = getClassScheduleDateRange({ school: user.school, now });

  // Date-scoped entries (imports, manual events) need a fetch window; recurring
  // courses are computed separately and are not clipped here.
  const windowStart = subDays(now, CALENDAR_WINDOW_PAST_DAYS);
  const windowEnd = addDays(now, CALENDAR_WINDOW_FUTURE_DAYS);

  await ensureUserCalendarCategories(prisma, user.id);

  const [memberships, calendarEntries, calendarCategories, mirroredScheduleKeys] = await Promise.all([
    prisma.userCourse.findMany({
      where: { userId: user.id },
      include: { course: true, sessions: true },
    }),
    prisma.calendarEntry.findMany({
      where: {
        userId: user.id,
        AND: [{ startAt: { lte: windowEnd } }, { endAt: { gte: windowStart } }],
      },
      include: {
        companions: {
          orderBy: { createdAt: "asc" },
        },
        category: {
          select: { id: true, name: true, color: true },
        },
      },
      orderBy: { startAt: "asc" },
    }),
    prisma.userCalendarCategory.findMany({
      where: { userId: user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, color: true, presetKey: true, sortOrder: true },
    }),
    prisma.calendarEntry.findMany({
      where: { userId: user.id, courseScheduleMirrorKey: { not: null } },
      select: { courseScheduleMirrorKey: true },
    }),
  ]);

  const mirroredSlotKeySet = new Set(
    mirroredScheduleKeys
      .map((r) => r.courseScheduleMirrorKey)
      .filter((k): k is string => Boolean(k)),
  );

  const connections = await prisma.connection.findMany({
    where: {
      status: "ACTIVE",
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    include: {
      userA: {
        select: { id: true, nickname: true, username: true, avatarUrl: true },
      },
      userB: {
        select: { id: true, nickname: true, username: true, avatarUrl: true },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  const courseCategory = calendarCategories.find((c) => c.presetKey === "course");

  const classBlocks: ClassBlock[] = memberships.flatMap((m) =>
    m.sessions
      .filter((s) => {
        const key = `${m.course.id}_${s.weekday}_${s.startMinute}`;
        return !mirroredSlotKeySet.has(key);
      })
      .map((s) => ({
        courseId: m.course.id,
        courseName: m.course.name,
        courseCode: m.course.code,
        weekday: s.weekday,
        startMinute: s.startMinute,
        endMinute: s.endMinute,
        location: s.location,
        categoryColor: null,
        categoryId: courseCategory?.id ?? null,
        categoryName: courseCategory?.name ?? null,
      })),
  );

  // Dates don't serialize cleanly across the client boundary, so ship ISO
  // strings and rehydrate in the client.
  const studyEntries: StudyEntry[] = calendarEntries.map((e) => {
    const mirrorCourse = isCalendarCourseMirrorRow(e);
    return {
      id: e.id,
      title: e.title,
      location: e.location,
      note: e.note,
      repeatRule: e.repeatRule,
      repeatUntilISO: e.repeatUntil?.toISOString() ?? null,
      startISO: e.startAt.toISOString(),
      endISO: e.endAt.toISOString(),
      withLabel: formatWithLabel(e.companions.map((companion) => companion.displayName)),
      eventParticipants: e.companions.map((companion) => ({
        userId: companion.userId,
        name: companion.displayName,
      })),
      categoryId: mirrorCourse ? (courseCategory?.id ?? null) : e.categoryId,
      categoryColor: mirrorCourse ? null : (e.category?.color ?? null),
      categoryName: mirrorCourse ? (courseCategory?.name ?? null) : (e.category?.name ?? null),
    };
  });

  const initialCalendarCategories = calendarCategories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    presetKey: c.presetKey,
  }));

  const companionOptions = connections.map((connection) => {
    const other = connection.userAId === user.id ? connection.userB : connection.userA;
    return {
      id: other.id,
      name: other.nickname ?? other.username,
      avatarUrl: other.avatarUrl,
    };
  });

  const hasAnyCourse = memberships.length > 0;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <HomeHero nickname={user.nickname} avatarUrl={user.avatarUrl} nowDate={now} />

      <div className="mt-3 flex min-h-0 flex-1 flex-col gap-3">
        {!user.onboardingComplete ? (
          <OnboardingContinueCta
            title="Finish setup to personalize Home"
            body="Your schedule already works. Completing your profile helps us tailor recommendations and class matching."
          />
        ) : null}
        <ScheduleSurface
          classBlocks={classBlocks}
          studyEntries={studyEntries}
          companionOptions={companionOptions}
          initialCalendarCategories={initialCalendarCategories}
          nowISO={now.toISOString()}
          semesterStartISO={semesterRange.start.toISOString()}
          semesterEndISO={semesterRange.end.toISOString()}
        />

        {!hasAnyCourse ? (
          <div className="rounded-2xl border border-[#E7E0D6] bg-white px-4 py-5 text-center text-sm text-[#5F6B7A] shadow-[0_8px_24px_rgba(15,23,42,0.05)] dark:border-border dark:bg-card dark:text-muted-foreground dark:shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            Your schedule is empty.{" "}
            <Link
              href={"/courses/add" as Route}
              className="font-semibold text-[#2563EB] underline-offset-2 hover:underline dark:text-blue-400"
            >
              Add your first course
            </Link>
            .
          </div>
        ) : null}
      </div>
    </div>
  );
}

function formatWithLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `With ${names[0]}`;
  return `With ${names[0]} +${names.length - 1}`;
}
