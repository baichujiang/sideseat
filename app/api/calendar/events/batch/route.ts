import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { createCalendarEventsBatchForUser } from "@/lib/calendar/create-calendar-events-batch";
import { prisma } from "@/lib/db/prisma";
import { error, formatZodError, ok, parseBody } from "@/lib/http";
import { batchCalendarEventsSchema } from "@/lib/validators/calendar-natural";
import { ZodError } from "zod";

export async function POST(request: Request) {
  try {
    const auth = await resolveOnboardedUserForApi();
    if (!auth.ok) {
      return error(auth.error, auth.status);
    }
    if (auth.user.isGuest) {
      return error("Create an account to add calendar events.", 403);
    }

    const parsed = parseBody(await request.json().catch(() => null), batchCalendarEventsSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }

    const user = auth.user;
    const result = await prisma.$transaction((tx) =>
      createCalendarEventsBatchForUser(user, parsed.data.events, tx),
    );

    return ok(result, { status: 201 });
  } catch (cause) {
    if (cause instanceof Error) {
      if (cause.message === "INVALID_COMPANIONS") {
        return error("Some classmates can no longer be added to an event.", 400);
      }
      if (cause.message === "INVALID_CATEGORY") {
        return error("Choose a valid calendar category.", 400);
      }
    }
    if (cause instanceof ZodError) {
      return error(formatZodError(cause), 400);
    }
    console.error(cause);
    return error("Unable to add events.");
  }
}
