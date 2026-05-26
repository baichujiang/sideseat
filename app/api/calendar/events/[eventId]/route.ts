import type { Prisma } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { isCalendarCourseMirrorRow } from "@/lib/calendar/calendar-course-mirror";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { calendarEventSchema } from "@/lib/validators/calendar";

type CalendarDeleteScope = "this" | "future" | "all";

function parseDeleteScope(raw: string | null): CalendarDeleteScope {
  if (raw === "future" || raw === "all") return raw;
  return "this";
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { eventId } = await params;
    const values = await parseJson(request, calendarEventSchema);

    const existing = await prisma.calendarEntry.findFirst({
      where: { id: eventId, userId: user.id },
      select: { id: true, source: true, courseScheduleMirrorKey: true },
    });

    if (!existing) {
      return error("Schedule item not found.", 404);
    }

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
      return error("Some classmates can no longer be added to this event.", 400);
    }

    const mirrorCourse = isCalendarCourseMirrorRow(existing);
    let resolvedCategoryId: string | null | undefined = undefined;
    if (mirrorCourse) {
      resolvedCategoryId = null;
    } else if (values.categoryId) {
      const cat = await prisma.userCalendarCategory.findFirst({
        where: { id: values.categoryId, userId: user.id },
        select: { id: true },
      });
      if (!cat) {
        return error("Choose a valid calendar category.", 400);
      }
      resolvedCategoryId = values.categoryId;
    } else if (values.categoryId !== undefined) {
      resolvedCategoryId = values.categoryId;
    }

    await prisma.calendarEntry.update({
      where: { id: existing.id },
      data: {
        title: values.title.trim(),
        location: values.location?.trim() || null,
        note: values.note?.trim() || null,
        ...(resolvedCategoryId !== undefined ? { categoryId: resolvedCategoryId } : {}),
        repeatRule: values.repeat,
        repeatUntil: values.repeat === "NONE" ? null : values.repeatUntil ? new Date(values.repeatUntil) : null,
        startAt: new Date(values.startAt),
        endAt: new Date(values.endAt),
        companions: {
          deleteMany: {},
          create: companions,
        },
      },
    });

    return ok({ ok: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update schedule item.");
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { eventId } = await params;
    const scope = parseDeleteScope(new URL(request.url).searchParams.get("scope"));

    const existing = await prisma.calendarEntry.findFirst({
      where: { id: eventId, userId: user.id },
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

    if (!existing) {
      return error("Schedule item not found.", 404);
    }

    const isRecurringSeries =
      existing.repeatRule !== "NONE" || Boolean(existing.recurrenceGroupId?.trim());

    if (!isRecurringSeries || scope === "this") {
      await prisma.calendarEntry.delete({
        where: { id: existing.id },
      });
      return ok({ ok: true });
    }

    const seriesWhere: Prisma.CalendarEntryWhereInput = existing.recurrenceGroupId
      ? { userId: user.id, recurrenceGroupId: existing.recurrenceGroupId }
      : existing.repeatRule !== "NONE"
        ? {
            userId: user.id,
            title: existing.title,
            repeatRule: existing.repeatRule,
            repeatUntil: existing.repeatUntil,
            categoryId: existing.categoryId,
          }
        : { userId: user.id, id: existing.id };

    if (scope === "all") {
      await prisma.calendarEntry.deleteMany({ where: seriesWhere });
      return ok({ ok: true });
    }

    /** `future` — this occurrence and later instances in the same series. */
    await prisma.calendarEntry.deleteMany({
      where: {
        ...seriesWhere,
        startAt: { gte: existing.startAt },
      },
    });

    return ok({ ok: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to delete schedule item.");
  }
}
