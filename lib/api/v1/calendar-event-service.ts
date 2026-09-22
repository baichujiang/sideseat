import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { isCalendarCourseMirrorRow } from "@/lib/calendar/calendar-course-mirror";
import {
  calendarOccurrenceId,
  parseCalendarOccurrenceId,
} from "@/lib/calendar/calendar-occurrence-id";
import {
  calendarOccurrenceBefore,
  expandCalendarRecurrenceInWindow,
} from "@/lib/calendar/calendar-recurrence";
import type { CalendarEventInput } from "@/lib/validators/calendar";

type CalendarDb = Prisma.TransactionClient | PrismaClient;

export class InvalidCalendarCompanionsError extends Error {}
export class InvalidCalendarCategoryError extends Error {}

const entrySelect = {
  id: true,
  userId: true,
  title: true,
  eventType: true,
  source: true,
  location: true,
  note: true,
  courseScheduleMirrorKey: true,
  repeatRule: true,
  repeatUntil: true,
  recurrenceGroupId: true,
  isRecurrenceMaster: true,
  recurrenceMasterId: true,
  recurrenceOriginalStartAt: true,
  startAt: true,
  endAt: true,
  categoryId: true,
} satisfies Prisma.CalendarEntrySelect;

type ExistingCalendarEntry = Prisma.CalendarEntryGetPayload<{
  select: typeof entrySelect;
}>;

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

async function resolveCategory(
  db: CalendarDb,
  userId: string,
  requestedCategoryId: string | null | undefined,
  mirrorCourse: boolean,
) {
  if (mirrorCourse) return null;
  const categoryId = requestedCategoryId ?? null;
  if (!categoryId) return null;
  const category = await db.userCalendarCategory.findFirst({
    where: { id: categoryId, userId },
    select: { id: true },
  });
  if (!category) throw new InvalidCalendarCategoryError();
  return categoryId;
}

function recurrenceSeed(entry: ExistingCalendarEntry) {
  return {
    startAt: entry.startAt,
    endAt: entry.endAt,
    repeat: entry.repeatRule,
    repeatUntil: entry.repeatUntil,
  } as const;
}

function isOccurrenceInSeries(master: ExistingCalendarEntry, originalStartAt: Date) {
  return expandCalendarRecurrenceInWindow(
    recurrenceSeed(master),
    new Date(originalStartAt.getTime() - 1),
    new Date(originalStartAt.getTime() + 1),
  ).some((occurrence) => occurrence.startAt.getTime() === originalStartAt.getTime());
}

/**
 * Converts a legacy materialized group only when it is edited. Missing rows in
 * the old materialized range become cancellation tombstones, so an old delete
 * or detached edit is never resurrected by the new windowed generator.
 */
async function promoteLegacySeries(
  db: CalendarDb,
  userId: string,
  selected: ExistingCalendarEntry,
): Promise<ExistingCalendarEntry> {
  if (selected.isRecurrenceMaster) return selected;
  if (!selected.recurrenceGroupId) {
    return db.calendarEntry.update({
      where: { id: selected.id },
      data: { isRecurrenceMaster: true },
      select: entrySelect,
    });
  }

  const group = await db.calendarEntry.findMany({
    where: {
      userId,
      projectionStatus: "ACTIVE",
      recurrenceGroupId: selected.recurrenceGroupId,
      recurrenceMasterId: null,
    },
    orderBy: [{ startAt: "asc" }, { id: "asc" }],
    select: entrySelect,
  });
  const anchor = group[0];
  const last = group[group.length - 1];
  if (!anchor || !last) return selected;

  const actualStarts = new Set(group.map((entry) => entry.startAt.getTime()));
  const expected = expandCalendarRecurrenceInWindow(
    recurrenceSeed(anchor),
    new Date(anchor.startAt.getTime() - 1),
    new Date(last.startAt.getTime() + 1),
  );
  const missing = expected.filter(
    (occurrence) => !actualStarts.has(occurrence.startAt.getTime()),
  );

  const promoted = await db.calendarEntry.update({
    where: { id: anchor.id },
    data: { isRecurrenceMaster: true },
    select: entrySelect,
  });
  if (missing.length > 0) {
    await db.calendarRecurrenceCancellation.createMany({
      data: missing.map((occurrence) => ({
        userId,
        recurrenceMasterId: anchor.id,
        originalStartAt: occurrence.startAt,
      })),
      skipDuplicates: true,
    });
  }
  await db.calendarEntry.deleteMany({
    where: {
      userId,
      recurrenceGroupId: selected.recurrenceGroupId,
      id: { not: anchor.id },
    },
  });
  return promoted;
}

type ResolvedTarget =
  | { kind: "single"; entry: ExistingCalendarEntry }
  | {
      kind: "series";
      master: ExistingCalendarEntry;
      originalStartAt: Date;
    };

async function resolveTarget(
  db: CalendarDb,
  userId: string,
  eventId: string,
): Promise<ResolvedTarget | null> {
  const occurrenceReference = parseCalendarOccurrenceId(eventId);
  if (occurrenceReference) {
    const rawSeries = await db.calendarEntry.findFirst({
      where: {
        id: occurrenceReference.seriesId,
        userId,
        projectionStatus: "ACTIVE",
      },
      select: entrySelect,
    });
    if (!rawSeries) return null;
    const master = rawSeries.isRecurrenceMaster
      ? rawSeries
      : await promoteLegacySeries(db, userId, rawSeries);
    if (!isOccurrenceInSeries(master, occurrenceReference.originalStartAt)) return null;
    return {
      kind: "series",
      master,
      originalStartAt: occurrenceReference.originalStartAt,
    };
  }

  const entry = await db.calendarEntry.findFirst({
    where: { id: eventId, userId, projectionStatus: "ACTIVE" },
    select: entrySelect,
  });
  if (!entry) return null;
  if (entry.recurrenceMasterId && entry.recurrenceOriginalStartAt) {
    const master = await db.calendarEntry.findFirst({
      where: {
        id: entry.recurrenceMasterId,
        userId,
        projectionStatus: "ACTIVE",
        isRecurrenceMaster: true,
      },
      select: entrySelect,
    });
    return master
      ? { kind: "series", master, originalStartAt: entry.recurrenceOriginalStartAt }
      : null;
  }
  if (entry.isRecurrenceMaster || entry.repeatRule !== "NONE" || entry.recurrenceGroupId) {
    const master = entry.isRecurrenceMaster
      ? entry
      : await promoteLegacySeries(db, userId, entry);
    return { kind: "series", master, originalStartAt: entry.startAt };
  }
  return { kind: "single", entry };
}

async function clearSeriesExceptions(db: CalendarDb, masterId: string) {
  const [overrides, cancellations] = await Promise.all([
    db.calendarEntry.deleteMany({ where: { recurrenceMasterId: masterId } }),
    db.calendarRecurrenceCancellation.deleteMany({ where: { recurrenceMasterId: masterId } }),
  ]);
  await db.calendarRecurrenceReminderReceipt.deleteMany({
    where: { recurrenceMasterId: masterId },
  });
  return overrides.count + cancellations.count;
}

function normalizedRepeatUntil(values: CalendarEventInput) {
  return values.repeat !== "NONE" && values.repeatUntil
    ? new Date(values.repeatUntil)
    : null;
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
  const target = await resolveTarget(db, options.userId, options.eventId);
  if (!target) return null;
  const base = target.kind === "series" ? target.master : target.entry;
  const mirrorCourse = isCalendarCourseMirrorRow(base);
  const values: CalendarEventInput = mirrorCourse
    ? { ...options.values, repeat: "NONE", repeatUntil: "" }
    : options.values;
  const [companions, categoryId] = await Promise.all([
    resolveCompanions(db, options.userId, values.withUserIds ?? []),
    resolveCategory(db, options.userId, values.categoryId, mirrorCourse),
  ]);

  if (target.kind === "single") {
    const recurring = values.repeat !== "NONE";
    const updated = await db.calendarEntry.update({
      where: { id: target.entry.id },
      data: {
        title: values.title.trim(),
        location: values.location?.trim() || null,
        note: values.note?.trim() || null,
        categoryId,
        repeatRule: values.repeat,
        repeatUntil: normalizedRepeatUntil(values),
        recurrenceGroupId: recurring ? crypto.randomUUID() : null,
        isRecurrenceMaster: recurring,
        startAt: new Date(values.startAt),
        endAt: new Date(values.endAt),
        reminder15mSentAt: null,
        companions: { deleteMany: {}, create: companions },
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

  const { master, originalStartAt } = target;
  if (options.scope === "this") {
    const existingOverride = await db.calendarEntry.findFirst({
      where: {
        recurrenceMasterId: master.id,
        recurrenceOriginalStartAt: originalStartAt,
        projectionStatus: "ACTIVE",
      },
      select: { id: true },
    });
    const override = existingOverride
      ? await db.calendarEntry.update({
          where: { id: existingOverride.id },
          data: {
            title: values.title.trim(),
            location: values.location?.trim() || null,
            note: values.note?.trim() || null,
            categoryId,
            startAt: new Date(values.startAt),
            endAt: new Date(values.endAt),
            reminder15mSentAt: null,
            companions: { deleteMany: {}, create: companions },
          },
          select: { id: true },
        })
      : await db.calendarEntry.create({
          data: {
            userId: options.userId,
            title: values.title.trim(),
            eventType: master.eventType,
            source: master.source,
            location: values.location?.trim() || null,
            note: values.note?.trim() || null,
            categoryId,
            startAt: new Date(values.startAt),
            endAt: new Date(values.endAt),
            recurrenceMasterId: master.id,
            recurrenceOriginalStartAt: originalStartAt,
            companions: companions.length ? { create: companions } : undefined,
          },
          select: { id: true },
        });
    await db.calendarRecurrenceCancellation.deleteMany({
      where: { recurrenceMasterId: master.id, originalStartAt },
    });
    return {
      id: calendarOccurrenceId(master.id, originalStartAt),
      scope: options.scope,
      updated: existingOverride ? 1 : 0,
      created: existingOverride ? 0 : 1,
      deleted: 0,
      overrideId: override.id,
    };
  }

  if (options.scope === "future" && originalStartAt > master.startAt) {
    const previous = calendarOccurrenceBefore(recurrenceSeed(master), originalStartAt);
    if (!previous) return null;
    await db.calendarEntry.update({
      where: { id: master.id },
      data: { repeatUntil: previous, reminder15mSentAt: null },
    });
    const [removedOverrides, removedCancellations] = await Promise.all([
      db.calendarEntry.deleteMany({
        where: {
          recurrenceMasterId: master.id,
          recurrenceOriginalStartAt: { gte: originalStartAt },
        },
      }),
      db.calendarRecurrenceCancellation.deleteMany({
        where: { recurrenceMasterId: master.id, originalStartAt: { gte: originalStartAt } },
      }),
      db.calendarRecurrenceReminderReceipt.deleteMany({
        where: { recurrenceMasterId: master.id, originalStartAt: { gte: originalStartAt } },
      }),
    ]);
    const recurring = values.repeat !== "NONE";
    const created = await db.calendarEntry.create({
      data: {
        userId: options.userId,
        title: values.title.trim(),
        eventType: master.eventType,
        source: master.source,
        location: values.location?.trim() || null,
        note: values.note?.trim() || null,
        categoryId,
        repeatRule: values.repeat,
        repeatUntil: normalizedRepeatUntil(values),
        recurrenceGroupId: recurring ? crypto.randomUUID() : null,
        isRecurrenceMaster: recurring,
        startAt: new Date(values.startAt),
        endAt: new Date(values.endAt),
        companions: companions.length ? { create: companions } : undefined,
      },
      select: { id: true },
    });
    return {
      id: created.id,
      scope: options.scope,
      updated: 1,
      created: 1,
      deleted: removedOverrides.count + removedCancellations.count,
    };
  }

  const requestedStart = new Date(values.startAt);
  const requestedEnd = new Date(values.endAt);
  const durationMs = requestedEnd.getTime() - requestedStart.getTime();
  const anchorStart = new Date(
    master.startAt.getTime() + requestedStart.getTime() - originalStartAt.getTime(),
  );
  const deleted = await clearSeriesExceptions(db, master.id);
  const recurring = values.repeat !== "NONE";
  await db.calendarEntry.update({
    where: { id: master.id },
    data: {
      title: values.title.trim(),
      location: values.location?.trim() || null,
      note: values.note?.trim() || null,
      categoryId,
      repeatRule: values.repeat,
      repeatUntil: normalizedRepeatUntil(values),
      recurrenceGroupId: recurring ? master.recurrenceGroupId ?? crypto.randomUUID() : null,
      isRecurrenceMaster: recurring,
      startAt: anchorStart,
      endAt: new Date(anchorStart.getTime() + durationMs),
      reminder15mSentAt: null,
      companions: { deleteMany: {}, create: companions },
    },
  });
  return {
    id: master.id,
    scope: options.scope,
    updated: 1,
    created: 0,
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
  const target = await resolveTarget(db, options.userId, options.eventId);
  if (!target) return null;
  if (target.kind === "single") {
    await db.calendarEntry.delete({ where: { id: target.entry.id } });
    return { deleted: 1 };
  }

  const { master, originalStartAt } = target;
  if (options.scope === "this") {
    const removedOverride = await db.calendarEntry.deleteMany({
      where: {
        recurrenceMasterId: master.id,
        recurrenceOriginalStartAt: originalStartAt,
      },
    });
    await db.calendarRecurrenceCancellation.upsert({
      where: {
        recurrenceMasterId_originalStartAt: {
          recurrenceMasterId: master.id,
          originalStartAt,
        },
      },
      create: {
        userId: options.userId,
        recurrenceMasterId: master.id,
        originalStartAt,
      },
      update: {},
    });
    return { deleted: Math.max(1, removedOverride.count) };
  }

  if (options.scope === "future" && originalStartAt > master.startAt) {
    const previous = calendarOccurrenceBefore(recurrenceSeed(master), originalStartAt);
    if (!previous) return null;
    await db.calendarEntry.update({
      where: { id: master.id },
      data: { repeatUntil: previous, reminder15mSentAt: null },
    });
    const [overrides, cancellations] = await Promise.all([
      db.calendarEntry.deleteMany({
        where: {
          recurrenceMasterId: master.id,
          recurrenceOriginalStartAt: { gte: originalStartAt },
        },
      }),
      db.calendarRecurrenceCancellation.deleteMany({
        where: { recurrenceMasterId: master.id, originalStartAt: { gte: originalStartAt } },
      }),
      db.calendarRecurrenceReminderReceipt.deleteMany({
        where: { recurrenceMasterId: master.id, originalStartAt: { gte: originalStartAt } },
      }),
    ]);
    return { deleted: Math.max(1, overrides.count + cancellations.count) };
  }

  const result = await db.calendarEntry.delete({
    where: { id: master.id },
    select: { id: true },
  });
  return { deleted: result ? 1 : 0 };
}
