import { ZodError } from "zod";

import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { createCalendarEventForUser } from "@/lib/calendar/create-calendar-event";
import { prisma } from "@/lib/db/prisma";
import { error, formatZodError, ok, parseBody } from "@/lib/http";
import { calendarEventSchema, type CalendarEventInput } from "@/lib/validators/calendar";

export async function POST(request: Request) {
  try {
    const auth = await resolveOnboardedUserForApi();
    if (!auth.ok) return error(auth.error, auth.status);

    const rawBody: unknown = await request.json().catch(() => null);
    const parsed = parseBody(rawBody, calendarEventSchema);
    if (!parsed.ok) return error(parsed.error, 400);

    const count = await prisma.$transaction((tx) =>
      createCalendarEventForUser(auth.user, parsed.data as CalendarEventInput, tx),
    );
    return ok({ count }, { status: 201 });
  } catch (cause) {
    if (cause instanceof ZodError) return error(formatZodError(cause), 400);
    if (cause instanceof Error && cause.message === "INVALID_COMPANIONS") {
      return error("Some classmates can no longer be added to this event.", 400);
    }
    if (cause instanceof Error && cause.message === "INVALID_CATEGORY") {
      return error("Choose a valid calendar category.", 400);
    }
    console.error(cause);
    return error("Unable to add event.");
  }
}
