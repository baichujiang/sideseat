import type { PrismaClient } from "@prisma/client";

import type {
  HomeCalendarCategory,
  HomeClassBlock,
  HomeCompanionOption,
  HomeSchedulePayload,
  HomeStudyEntry,
} from "@/lib/home/home-schedule-dto";
import { isCalendarCourseMirrorRow } from "@/lib/calendar/calendar-course-mirror";
import { loadCalendarEntryOccurrences } from "@/lib/calendar/load-calendar-entry-occurrences";
import { ensureUserCalendarCategories } from "@/lib/calendar/default-user-calendar-categories";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";

export type { HomeSchedulePayload } from "@/lib/home/home-schedule-dto";

export async function loadHomeSchedulePayload(args: {
  prisma: PrismaClient;
  userId: string;
  windowStart: Date;
  windowEnd: Date;
}): Promise<HomeSchedulePayload> {
  const { prisma, userId, windowStart, windowEnd } = args;

  await ensureUserCalendarCategories(prisma, userId);

  const [memberships, calendarEntries, calendarCategories, mirroredScheduleKeys, connections] =
    await Promise.all([
      prisma.userCourse.findMany({
        where: { userId, ...activeCourseMembershipWhere() },
        include: { course: true, sessions: true },
      }),
      loadCalendarEntryOccurrences(prisma, { userId, windowStart, windowEnd }),
      prisma.userCalendarCategory.findMany({
        where: { userId },
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
        where: {
          userId,
          projectionStatus: "ACTIVE",
          courseScheduleMirrorKey: { not: null },
        },
        select: { courseScheduleMirrorKey: true },
      }),
      prisma.connection.findMany({
        where: {
          status: "ACTIVE",
          OR: [{ userAId: userId }, { userBId: userId }],
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
      }),
    ]);

  const mirroredSlotKeySet = new Set(
    mirroredScheduleKeys
      .map((r) => r.courseScheduleMirrorKey)
      .filter((k): k is string => Boolean(k)),
  );

  const classBlocks: HomeClassBlock[] = memberships.flatMap((m) =>
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
        categoryId: null,
        categoryName: null,
      })),
  );

  const studyEntries: HomeStudyEntry[] = calendarEntries.map((e) => {
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
      eventType: e.eventType,
      categoryId: mirrorCourse ? null : e.categoryId,
      categoryColor: mirrorCourse ? null : (e.category?.color ?? null),
      categoryName: mirrorCourse ? null : (e.category?.name ?? null),
      discoverActivityId: e.discoverActivityId,
    };
  });

  const initialCalendarCategories: HomeCalendarCategory[] = calendarCategories.map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    presetKey: c.presetKey,
    icsSubscriptionUrl: c.icsSubscriptionUrl,
  }));

  const companionOptions: HomeCompanionOption[] = connections.map((connection) => {
    const other = connection.userAId === userId ? connection.userB : connection.userA;
    return {
      id: other.id,
      name: other.nickname ?? other.username,
      avatarUrl: other.avatarUrl,
    };
  });

  return {
    classBlocks,
    studyEntries,
    companionOptions,
    initialCalendarCategories,
  };
}

function formatWithLabel(names: string[]): string | null {
  if (names.length === 0) return null;
  if (names.length === 1) return `With ${names[0]}`;
  return `With ${names[0]} +${names.length - 1}`;
}
