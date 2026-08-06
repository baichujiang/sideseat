import "server-only";

import type { Prisma, User } from "@prisma/client";

import { expandCalendarRecurrence } from "@/lib/calendar/calendar-recurrence";
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
  const repeatUntil = values.repeatUntil ? new Date(values.repeatUntil) : null;
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

  const categoryId: string | null = values.categoryId ?? null;
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

  let created = 0;
  const occurrences = expandCalendarRecurrence(values);
  for (const occurrence of occurrences) {
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
        startAt: occurrence.startAt,
        endAt: occurrence.endAt,
        companions: companions.length
          ? {
              create: companions,
            }
          : undefined,
      },
    });
    created += 1;
  }

  return created;
}
