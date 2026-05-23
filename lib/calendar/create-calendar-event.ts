import "server-only";

import { addDays, addMonths, addWeeks, addYears } from "date-fns";
import type { Prisma, User } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { CalendarEventInput } from "@/lib/validators/calendar";

type Tx = Prisma.TransactionClient;

/**
 * Creates one logical calendar event (expands repeats). Returns number of rows inserted.
 */
export async function createCalendarEventForUser(
  user: Pick<User, "id">,
  values: CalendarEventInput,
  tx: Tx = prisma,
): Promise<number> {
  const startAt = new Date(values.startAt);
  const endAt = new Date(values.endAt);
  const repeatUntil = values.repeatUntil ? new Date(values.repeatUntil) : null;
  const durationMs = endAt.getTime() - startAt.getTime();
  const requestedCompanionIds = [...new Set(values.withUserIds ?? [])];

  const activeConnections = requestedCompanionIds.length
    ? await tx.connection.findMany({
        where: {
          status: "ACTIVE",
          OR: [
            { userAId: user.id, userBId: { in: requestedCompanionIds } },
            { userBId: user.id, userAId: { in: requestedCompanionIds } },
          ],
        },
        include: {
          userA: { select: { id: true, nickname: true, username: true } },
          userB: { select: { id: true, nickname: true, username: true } },
        },
      })
    : [];

  const companions = activeConnections.map((connection) => {
    const other = connection.userAId === user.id ? connection.userB : connection.userA;
    return {
      userId: other.id,
      displayName: other.nickname ?? other.username,
    };
  });

  if (companions.length !== requestedCompanionIds.length) {
    throw new Error("INVALID_COMPANIONS");
  }

  let categoryId: string | null = values.categoryId ?? null;
  if (categoryId) {
    const cat = await tx.userCalendarCategory.findFirst({
      where: { id: categoryId, userId: user.id },
      select: { id: true },
    });
    if (!cat) {
      throw new Error("INVALID_CATEGORY");
    }
  }

  const recurrenceGroupId = values.repeat !== "NONE" ? crypto.randomUUID() : null;

  let cursor = new Date(startAt);
  let count = 0;
  let created = 0;

  while (count < 120) {
    if (values.repeat !== "NONE" && repeatUntil && cursor > repeatUntil) {
      break;
    }

    await tx.calendarEntry.create({
      data: {
        userId: user.id,
        title: values.title.trim(),
        location: values.location?.trim() || null,
        note: values.note?.trim() || null,
        categoryId,
        repeatRule: values.repeat,
        repeatUntil,
        recurrenceGroupId,
        startAt: new Date(cursor),
        endAt: new Date(cursor.getTime() + durationMs),
        companions: companions.length
          ? {
              create: companions,
            }
          : undefined,
      },
    });
    created += 1;
    count += 1;
    if (values.repeat === "NONE") break;
    cursor =
      values.repeat === "DAILY"
        ? addDays(cursor, 1)
        : values.repeat === "WEEKLY"
          ? addWeeks(cursor, 1)
          : values.repeat === "BIWEEKLY"
            ? addWeeks(cursor, 2)
            : values.repeat === "MONTHLY"
              ? addMonths(cursor, 1)
              : addYears(cursor, 1);
  }

  return created;
}
