import type { Weekday } from "@prisma/client";
import { addDays, subDays } from "date-fns";
import { GuestAppCta } from "@/components/app/guest-app-cta";
import {
  ScheduleSurface,
  type ClassBlock,
  type StudyEntry,
} from "@/components/home/schedule-surface";
import { isCalendarCourseMirrorRow } from "@/lib/calendar/calendar-course-mirror";
import { ensureUserCalendarCategories } from "@/lib/calendar/default-user-calendar-categories";
import { loadIcsSubscriptionStudyEntries } from "@/lib/calendar/load-ics-subscription-entries";
import { getClassScheduleDateRange } from "@/lib/constants/vorlesungszeit";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";

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
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  if (!sessionUser) {
    const now = new Date();
    const semesterRange = getClassScheduleDateRange({ school: null, now });
    return (
      <div className="flex min-h-0 flex-1 flex-col gap-3">
        <ScheduleSurface
          classBlocks={[]}
          studyEntries={[]}
          companionOptions={[]}
          initialCalendarCategories={[]}
          nowISO={now.toISOString()}
          semesterStartISO={semesterRange.start.toISOString()}
          semesterEndISO={semesterRange.end.toISOString()}
          homeGreeting={{ nickname: null, avatarUrl: null }}
        />
        <GuestAppCta returnTo="/home" headline={ui.guest.homeHeadline} body={ui.guest.homeBody} />
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
      select: {
        id: true,
        name: true,
        color: true,
        presetKey: true,
        sortOrder: true,
        icsSubscriptionUrl: true,
      },
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
  const dbStudyEntries: StudyEntry[] = calendarEntries.map((e) => {
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

  const subscriptionStudyEntries = await loadIcsSubscriptionStudyEntries({
    categories: calendarCategories.map((c) => ({
      id: c.id,
      name: c.name,
      color: c.color,
      icsSubscriptionUrl: c.icsSubscriptionUrl,
    })),
    windowStart,
    windowEnd,
  });

  const studyEntries: StudyEntry[] = [...dbStudyEntries, ...subscriptionStudyEntries];

  const initialCalendarCategories = calendarCategories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    presetKey: c.presetKey,
    icsSubscriptionUrl: c.icsSubscriptionUrl,
  }));

  const companionOptions = connections.map((connection) => {
    const other = connection.userAId === user.id ? connection.userB : connection.userA;
    return {
      id: other.id,
      name: other.nickname ?? other.username,
      avatarUrl: other.avatarUrl,
    };
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <ScheduleSurface
        classBlocks={classBlocks}
        studyEntries={studyEntries}
        companionOptions={companionOptions}
        initialCalendarCategories={initialCalendarCategories}
        nowISO={now.toISOString()}
        semesterStartISO={semesterRange.start.toISOString()}
        semesterEndISO={semesterRange.end.toISOString()}
        homeGreeting={{ nickname: user.nickname, avatarUrl: user.avatarUrl }}
        homeBelowHeaderSlot={null}
      />
    </div>
  );
}

function formatWithLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `With ${names[0]}`;
  return `With ${names[0]} +${names.length - 1}`;
}
