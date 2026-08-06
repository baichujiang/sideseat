import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { isCalendarCourseMirrorRow } from "@/lib/calendar/calendar-course-mirror";
import { expandCalendarRecurrence } from "@/lib/calendar/calendar-recurrence";
import type { CalendarEventInput } from "@/lib/validators/calendar";

type CalendarDb = Prisma.TransactionClient | PrismaClient;

export class InvalidCalendarCompanionsError extends Error {}
export class InvalidCalendarCategoryError extends Error {}

type ExistingCalendarEntry = {
  id: string;
  title: string;
  source: string;
  courseScheduleMirrorKey: string | null;
  repeatRule: CalendarEventInput["repeat"];
  repeatUntil: Date | null;
  recurrenceGroupId: string | null;
  startAt: Date;
  categoryId: string | null;
};

function seriesWhere(
  userId: string,
  entry: Pick<
    ExistingCalendarEntry,
    "id" | "title" | "repeatRule" | "repeatUntil" | "recurrenceGroupId" | "categoryId"
  >,
): Prisma.CalendarEntryWhereInput {
  if (entry.recurrenceGroupId) {
    return { userId, recurrenceGroupId: entry.recurrenceGroupId };
  }
  if (entry.repeatRule !== "NONE") {
    return {
      userId,
      title: entry.title,
      repeatRule: entry.repeatRule,
      repeatUntil: entry.repeatUntil,
      categoryId: entry.categoryId,
    };
  }
  return { userId, id: entry.id };
}

async function resolveCompanions(
  db: CalendarDb,
  userId: string,
  requestedIds: string[],
) {
  const userIds = [...new Set(requestedIds)];
  const activeConnections = userIds.length
    ? await db.connection.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { userAId: userId, userBId: { in: userIds } },
            { userBId: userId, userAId: { in: userIds } },
          ],
        },
        include: {
          userA: { select: { id: true, nickname: true, username: true } },
          userB: { select: { id: true, nickname: true, username: true } },
        },
      })
    : [];

  const companions = activeConnections.map((connection) => {
    const other = connection.userAId === userId ? connection.userB : connection.userA;
    return {
      userId: other.id,
      displayName: other.nickname ?? other.username,
    };
  });
  if (companions.length !== userIds.length) {
    throw new InvalidCalendarCompanionsError();
  }
  return companions;
}

export async function updateCalendarEventForUser(
  db: CalendarDb,
  options: {
    eventId: string;
    userId: string;
    values: CalendarEventInput;
    scope: CalendarUpdateScope;
  },
) {
  const existing = await db.calendarEntry.findFirst({
    where: { id: options.eventId, userId: options.userId },
    select: {
      id: true,
      title: true,
      source: true,
      courseScheduleMirrorKey: true,
      repeatRule: true,
      repeatUntil: true,
      recurrenceGroupId: true,
      startAt: true,
      categoryId: true,
    },
  });
  if (!existing) return null;

  const companions = await resolveCompanions(
    db,
    options.userId,
    options.values.withUserIds ?? [],
  );
  const mirrorCourse = isCalendarCourseMirrorRow(existing);
  let categoryId: string | null = options.values.categoryId ?? null;
  if (mirrorCourse) {
    categoryId = null;
  } else if (categoryId) {
    const category = await db.userCalendarCategory.findFirst({
      where: { id: categoryId, userId: options.userId },
      select: { id: true },
    });
    if (!category) throw new InvalidCalendarCategoryError();
  }

  const values: CalendarEventInput = mirrorCourse
    ? { ...options.values, repeat: "NONE", repeatUntil: "" }
    : options.values;
  const recurring = existing.repeatRule !== "NONE" || Boolean(existing.recurrenceGroupId);

  if ((recurring && options.scope === "this") || (!recurring && values.repeat === "NONE")) {
    const detachFromSeries = recurring && options.scope === "this";
    const updated = await db.calendarEntry.update({
      where: { id: existing.id },
      data: {
        title: values.title.trim(),
        location: values.location?.trim() || null,
        note: values.note?.trim() || null,
        categoryId,
        repeatRule: detachFromSeries ? "NONE" : values.repeat,
        repeatUntil:
          detachFromSeries || values.repeat === "NONE"
            ? null
            : values.repeatUntil
              ? new Date(values.repeatUntil)
              : null,
        recurrenceGroupId: detachFromSeries ? null : existing.recurrenceGroupId,
        startAt: new Date(values.startAt),
        endAt: new Date(values.endAt),
        reminder15mSentAt: null,
        companions: {
          deleteMany: {},
          create: companions,
        },
      },
      select: { id: true },
    });
    return {
      id: updated.id,
      scope: options.scope,
      updated: 1,
      created: 0,
      deleted: 0,
    };
  }

  const selectedStart = existing.startAt;
  const requestedStart = new Date(values.startAt);
  const requestedEnd = new Date(values.endAt);
  const durationMs = requestedEnd.getTime() - requestedStart.getTime();
  const originalSeriesWhere = seriesWhere(options.userId, existing);
  const anchor =
    recurring && options.scope === "all"
      ? await db.calendarEntry.findFirst({
          where: originalSeriesWhere,
          orderBy: [{ startAt: "asc" }, { id: "asc" }],
          select: {
            id: true,
            title: true,
            source: true,
            courseScheduleMirrorKey: true,
            repeatRule: true,
            repeatUntil: true,
            recurrenceGroupId: true,
            startAt: true,
            categoryId: true,
          },
        })
      : existing;
  if (!anchor) return null;

  const anchorStart =
    recurring && options.scope === "all"
      ? new Date(anchor.startAt.getTime() + requestedStart.getTime() - selectedStart.getTime())
      : requestedStart;
  const replacementValues: CalendarEventInput = {
    ...values,
    startAt: anchorStart.toISOString(),
    endAt: new Date(anchorStart.getTime() + durationMs).toISOString(),
  };
  const occurrences = expandCalendarRecurrence(replacementValues);
  const first = occurrences[0];
  if (!first) throw new Error("CALENDAR_RECURRENCE_EMPTY");
  const recurrenceGroupId = values.repeat === "NONE" ? null : existing.recurrenceGroupId ?? crypto.randomUUID();
  const replacementRepeatUntil =
    values.repeat !== "NONE" && values.repeatUntil ? new Date(values.repeatUntil) : null;

  let deleted = 0;
  if (recurring) {
    const removed = await db.calendarEntry.deleteMany({
      where: {
        ...originalSeriesWhere,
        id: { not: anchor.id },
        ...(options.scope === "future" ? { startAt: { gte: selectedStart } } : {}),
      },
    });
    deleted = removed.count;
  }

  await db.calendarEntry.update({
    where: { id: anchor.id },
    data: {
      title: values.title.trim(),
      location: values.location?.trim() || null,
      note: values.note?.trim() || null,
      categoryId,
      repeatRule: values.repeat,
      repeatUntil: replacementRepeatUntil,
      recurrenceGroupId,
      startAt: first.startAt,
      endAt: first.endAt,
      reminder15mSentAt: null,
      companions: {
        deleteMany: {},
        create: companions,
      },
    },
  });

  for (const occurrence of occurrences.slice(1)) {
    await db.calendarEntry.create({
      data: {
        userId: options.userId,
        source: anchor.source,
        title: values.title.trim(),
        location: values.location?.trim() || null,
        note: values.note?.trim() || null,
        categoryId,
        repeatRule: values.repeat,
        repeatUntil: replacementRepeatUntil,
        recurrenceGroupId,
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        companions: companions.length ? { create: companions } : undefined,
      },
    });
  }

  return {
    id: anchor.id,
    scope: options.scope,
    updated: 1,
    created: Math.max(0, occurrences.length - 1),
    deleted,
  };
}

export type CalendarUpdateScope = "this" | "future" | "all";
export type CalendarDeleteScope = "this" | "future" | "all";

export async function deleteCalendarEventForUser(
  db: CalendarDb,
  options: {
    eventId: string;
    userId: string;
    scope: CalendarDeleteScope;
  },
) {
  const existing = await db.calendarEntry.findFirst({
    where: { id: options.eventId, userId: options.userId },
    select: {
      id: true,
      title: true,
      repeatRule: true,
      repeatUntil: true,
      startAt: true,
      recurrenceGroupId: true,
      categoryId: true,
    },
  });
  if (!existing) return null;

  const recurring = existing.repeatRule !== "NONE" || Boolean(existing.recurrenceGroupId);
  if (!recurring || options.scope === "this") {
    await db.calendarEntry.delete({ where: { id: existing.id } });
    return { deleted: 1 };
  }

  const targetSeries = seriesWhere(options.userId, existing);
  const result = await db.calendarEntry.deleteMany({
    where:
      options.scope === "all"
        ? targetSeries
        : { ...targetSeries, startAt: { gte: existing.startAt } },
  });
  return { deleted: result.count };
}
