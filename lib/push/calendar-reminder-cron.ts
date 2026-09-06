import "server-only";

import { format } from "date-fns";
import { Prisma } from "@prisma/client";

import { loadCalendarEntryOccurrences } from "@/lib/calendar/load-calendar-entry-occurrences";
import { prisma } from "@/lib/db/prisma";
import { notifyUserWebPush } from "@/lib/push/notify-user";

/** Minutes before `startAt` when we try to fire the reminder. */
const LEAD_MINUTES = 15;
/** Half-width of the `startAt` window (minutes). Cron should run at least this often. */
const WINDOW_HALF_MINUTES = 6;

function reminderWindow(now: Date) {
  const ms = 60 * 1000;
  const center = now.getTime() + LEAD_MINUTES * ms;
  const half = WINDOW_HALF_MINUTES * ms;
  return { startAtMin: new Date(center - half), startAtMax: new Date(center + half) };
}

/**
 * Claims due calendar rows and sends one Web Push per owner.
 * Uses `reminder15mSentAt` so repeats are skipped even if the cron overlaps the window.
 */
export async function runCalendarReminderCron(now = new Date()): Promise<{ claimed: number }> {
  const { startAtMin, startAtMax } = reminderWindow(now);

  await prisma.calendarRecurrenceReminderReceipt.deleteMany({
    where: { sentAt: { lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) } },
  });

  const candidateOwners = await prisma.calendarEntry.findMany({
    where: {
      projectionStatus: "ACTIVE",
      OR: [
        {
          isRecurrenceMaster: false,
          recurrenceMasterId: null,
          reminder15mSentAt: null,
          startAt: { gte: startAtMin, lte: startAtMax },
          endAt: { gt: now },
        },
        {
          isRecurrenceMaster: true,
          startAt: { lte: startAtMax },
          OR: [{ repeatUntil: null }, { repeatUntil: { gte: startAtMin } }],
        },
        {
          isRecurrenceMaster: false,
          recurrenceMasterId: null,
          recurrenceGroupId: { not: null },
          repeatRule: { not: "NONE" },
          startAt: { lte: startAtMax },
          repeatUntil: { gte: startAtMin },
        },
      ],
    },
    distinct: ["userId"],
    select: { userId: true },
  });

  const candidates = (
    await Promise.all(
      candidateOwners.map((owner) =>
        loadCalendarEntryOccurrences(prisma, {
          userId: owner.userId,
          windowStart: startAtMin,
          windowEnd: new Date(startAtMax.getTime() + 1),
        }),
      ),
    )
  ).flat();

  let claimed = 0;
  for (const entry of candidates) {
    if (entry.startAt < startAtMin || entry.startAt > startAtMax || entry.endAt <= now) continue;
    if (entry.seriesMasterId && entry.originalStartAt) {
      try {
        await prisma.calendarRecurrenceReminderReceipt.create({
          data: {
            userId: entry.userId,
            recurrenceMasterId: entry.seriesMasterId,
            originalStartAt: entry.originalStartAt,
            sentAt: now,
          },
        });
      } catch (cause) {
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
          continue;
        }
        throw cause;
      }
    } else {
      const updated = await prisma.calendarEntry.updateMany({
        where: {
          id: entry.id,
          projectionStatus: "ACTIVE",
          reminder15mSentAt: null,
          startAt: { gte: startAtMin, lte: startAtMax },
        },
        data: { reminder15mSentAt: now },
      });
      if (updated.count === 0) continue;
    }
    claimed += 1;

    const when = format(entry.startAt, "MMM d, HH:mm");
    const place = entry.location?.trim();
    const body = place ? `${when} · ${place}` : `${when} · starting soon`;

    // Native iOS reminders are scheduled locally during calendar sync. Keep
    // this scan browser-only so enabling a recovery cron cannot notify twice.
    await notifyUserWebPush(entry.userId, {
      title: `Soon: ${entry.title}`,
      body,
      url: "/home",
    });
  }

  return { claimed };
}
