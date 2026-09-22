import "server-only";

import type { Prisma, User } from "@prisma/client";

import { createCalendarEventForUser } from "@/lib/calendar/create-calendar-event";
import type { CalendarEventInput } from "@/lib/validators/calendar";

type CalendarBatchEventInput = Omit<CalendarEventInput, "repeat" | "withUserIds"> &
  Partial<Pick<CalendarEventInput, "repeat" | "withUserIds">>;

export function normalizeCalendarEventsBatch(events: CalendarBatchEventInput[]): CalendarEventInput[] {
  return events.map((event) => ({
    ...event,
    repeat: event.repeat ?? "NONE",
    withUserIds: event.withUserIds ?? [],
  }));
}

export async function createCalendarEventsBatchForUser(
  user: Pick<User, "id">,
  events: CalendarBatchEventInput[],
  tx: Prisma.TransactionClient,
) {
  const normalizedEvents = normalizeCalendarEventsBatch(events);
  let count = 0;
  for (const event of normalizedEvents) {
    count += await createCalendarEventForUser(user, event, tx);
  }
  return { count, events: normalizedEvents.length };
}
