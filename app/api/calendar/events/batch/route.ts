import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { createCalendarEventForUser } from "@/lib/calendar/create-calendar-event";
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
    let totalCreated = 0;

    await prisma.$transaction(async (tx) => {
      for (const raw of parsed.data.events) {
        const eventInput = { ...raw, repeat: raw.repeat ?? "NONE" as const, withUserIds: raw.withUserIds ?? [] };
        try {
          totalCreated += await createCalendarEventForUser(user, eventInput, tx);
        } catch (e) {
          if (e instanceof Error) {
            if (e.message === "INVALID_COMPANIONS") {
              throw new Error("COMPANIONS");
            }
            if (e.message === "INVALID_CATEGORY") {
              throw new Error("CATEGORY");
            }
          }
          throw e;
        }
      }
    });

    return ok({ count: totalCreated, events: parsed.data.events.length }, { status: 201 });
  } catch (cause) {
    if (cause instanceof Error) {
      if (cause.message === "COMPANIONS") {
        return error("Some classmates can no longer be added to an event.", 400);
      }
      if (cause.message === "CATEGORY") {
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
