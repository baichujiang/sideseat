import Link from "next/link";
import type { Route } from "next";
import type { Weekday } from "@prisma/client";
import { addDays, subDays } from "date-fns";
import { redirect } from "next/navigation";

import { GuestAppCta } from "@/components/app/guest-app-cta";
import { HomeHero } from "@/components/home/home-hero";
import {
  ScheduleSurface,
  type ClassBlock,
  type StudyEntry,
} from "@/components/home/schedule-surface";
import { getCurrentSemesterDateRange } from "@/lib/constants/semester";
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

const CALENDAR_WINDOW_DAYS = 90;

export default async function HomePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    const now = new Date();
    const semesterRange = getCurrentSemesterDateRange(now);
    return (
      <div className="space-y-5 pb-[var(--schedule-content-clearance)]">
        <HomeHero nickname={null} avatarUrl={null} nowDate={now} />
        <ScheduleSurface
          classBlocks={[]}
          studyEntries={[]}
          companionOptions={[]}
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
    );
  }
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
  }
  const user = sessionUser;
  const now = new Date();
  const semesterRange = getCurrentSemesterDateRange(now);

  // ±90 days of calendar entries lets the Day/Week/Month views navigate a
  // full semester's range without re-fetching. Courses are recurring so they
  // don't need a window at all.
  const windowStart = subDays(now, CALENDAR_WINDOW_DAYS);
  const windowEnd = addDays(now, CALENDAR_WINDOW_DAYS);

  const [memberships, calendarEntries] = await Promise.all([
    prisma.userCourse.findMany({
      where: { userId: user.id },
      include: { course: true, sessions: true },
    }),
    prisma.calendarEntry.findMany({
      where: {
        userId: user.id,
        startAt: { gte: windowStart, lte: windowEnd },
      },
      include: {
        companions: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { startAt: "asc" },
    }),
  ]);

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

  const classBlocks: ClassBlock[] = memberships.flatMap((m) =>
    m.sessions.map((s) => ({
      courseId: m.course.id,
      courseName: m.course.name,
      courseCode: m.course.code,
      weekday: s.weekday,
      startMinute: s.startMinute,
      endMinute: s.endMinute,
      location: s.location,
    })),
  );

  // Dates don't serialize cleanly across the client boundary, so ship ISO
  // strings and rehydrate in the client.
  const studyEntries: StudyEntry[] = calendarEntries.map((e) => ({
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
    <div className="space-y-5 pb-[var(--schedule-content-clearance)]">
      <HomeHero
        nickname={user.nickname}
        avatarUrl={user.avatarUrl}
        nowDate={now}
      />

      <ScheduleSurface
        classBlocks={classBlocks}
        studyEntries={studyEntries}
        companionOptions={companionOptions}
        nowISO={now.toISOString()}
        semesterStartISO={semesterRange.start.toISOString()}
        semesterEndISO={semesterRange.end.toISOString()}
      />

      {!hasAnyCourse ? (
        <div className="rounded-2xl border border-dashed border-border bg-muted/20 px-4 py-5 text-center text-sm text-muted-foreground">
          Your schedule is empty.{" "}
          <Link
            href={"/courses/add" as Route}
            className="font-medium text-foreground underline-offset-2 hover:underline"
          >
            Add your first course
          </Link>
          .
        </div>
      ) : null}
    </div>
  );
}

function formatWithLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `With ${names[0]}`;
  return `With ${names[0]} +${names.length - 1}`;
}
