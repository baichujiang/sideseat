import "server-only";

import { format } from "date-fns";

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

  const candidates = await prisma.calendarEntry.findMany({
    where: {
      reminder15mSentAt: null,
      startAt: { gte: startAtMin, lte: startAtMax },
      endAt: { gt: now },
    },
    select: { id: true, userId: true, title: true, location: true, startAt: true },
  });

  let claimed = 0;
  for (const entry of candidates) {
    const updated = await prisma.calendarEntry.updateMany({
      where: {
        id: entry.id,
        reminder15mSentAt: null,
        startAt: { gte: startAtMin, lte: startAtMax },
      },
      data: { reminder15mSentAt: now },
    });
    if (updated.count === 0) continue;
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
