import { addDays, addMonths, addWeeks, addYears } from "date-fns";

import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, formatZodError, ok, parseBody } from "@/lib/http";
import { calendarEventSchema } from "@/lib/validators/calendar";
import { ZodError } from "zod";

export async function POST(request: Request) {
  try {
    const auth = await resolveOnboardedUserForApi();
    if (!auth.ok) {
      return error(auth.error, auth.status);
    }
    const user = auth.user;

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = parseBody(rawBody, calendarEventSchema);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }
    const values = parsed.data;

    const startAt = new Date(values.startAt);
    const endAt = new Date(values.endAt);
    const repeatUntil = values.repeatUntil ? new Date(values.repeatUntil) : null;
    const durationMs = endAt.getTime() - startAt.getTime();
    const requestedCompanionIds = [...new Set(values.withUserIds ?? [])];

    const activeConnections = requestedCompanionIds.length
      ? await prisma.connection.findMany({
          where: {
            status: "ACTIVE",
            OR: [
              { userAId: user.id, userBId: { in: requestedCompanionIds } },
              { userBId: user.id, userAId: { in: requestedCompanionIds } },
            ],
          },
          include: {
            userA: {
              select: { id: true, nickname: true, username: true },
            },
            userB: {
              select: { id: true, nickname: true, username: true },
            },
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
      return error("Some classmates can no longer be added to this event.", 400);
    }

    let categoryId: string | null = values.categoryId ?? null;
    if (categoryId) {
      const cat = await prisma.userCalendarCategory.findFirst({
        where: { id: categoryId, userId: user.id },
        select: { id: true },
      });
      if (!cat) {
        return error("Choose a valid calendar category.", 400);
      }
    }

    const entries: Array<{
      title: string;
      location: string | null;
      note: string | null;
      startAt: Date;
      endAt: Date;
    }> = [];

    const recurrenceGroupId = values.repeat !== "NONE" ? crypto.randomUUID() : null;

    let cursor = new Date(startAt);
    let count = 0;
    while (count < 120) {
      if (values.repeat !== "NONE" && repeatUntil && cursor > repeatUntil) {
        break;
      }
      entries.push({
        title: values.title.trim(),
        location: values.location?.trim() || null,
        note: values.note?.trim() || null,
        startAt: new Date(cursor),
        endAt: new Date(cursor.getTime() + durationMs),
      });
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

    const createdCount = await prisma.$transaction(async (tx) => {
      let count = 0;
      for (const entry of entries) {
        await tx.calendarEntry.create({
          data: {
            userId: user.id,
            title: entry.title,
            location: entry.location,
            note: entry.note,
            categoryId,
            repeatRule: values.repeat,
            repeatUntil,
            recurrenceGroupId,
            startAt: entry.startAt,
            endAt: entry.endAt,
            companions: companions.length
              ? {
                  create: companions,
                }
              : undefined,
          },
        });
        count += 1;
      }
      return count;
    });

    return ok({ count: createdCount }, { status: 201 });
  } catch (cause) {
    if (cause instanceof ZodError) {
      return error(formatZodError(cause), 400);
    }
    console.error(cause);
    return error("Unable to add event.");
  }
}
