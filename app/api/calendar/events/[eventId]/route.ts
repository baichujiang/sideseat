import { requireOnboardedUser } from "@/lib/auth/guards";
import {
  deleteCalendarEventForUser,
  InvalidCalendarCategoryError,
  InvalidCalendarCompanionsError,
  type CalendarDeleteScope,
  type CalendarUpdateScope,
  updateCalendarEventForUser,
} from "@/lib/api/v1/calendar-event-service";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { calendarEventSchema, type CalendarEventInput } from "@/lib/validators/calendar";

function parseScope(raw: string | null): CalendarDeleteScope & CalendarUpdateScope {
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
    const scope = parseScope(new URL(request.url).searchParams.get("scope"));
    const updated = await prisma.$transaction((tx) =>
      updateCalendarEventForUser(tx, {
        eventId,
        userId: user.id,
        values: values as CalendarEventInput,
        scope,
      }),
    );
    if (!updated) return error("Schedule item not found.", 404);
    return ok({ ok: true });
  } catch (cause) {
    if (cause instanceof InvalidCalendarCompanionsError) {
      return error("Some classmates can no longer be added to this event.", 400);
    }
    if (cause instanceof InvalidCalendarCategoryError) {
      return error("Choose a valid calendar category.", 400);
    }
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
    const scope = parseScope(new URL(request.url).searchParams.get("scope"));
    const deleted = await prisma.$transaction((tx) =>
      deleteCalendarEventForUser(tx, {
        eventId,
        userId: user.id,
        scope,
      }),
    );
    if (!deleted) return error("Schedule item not found.", 404);
    return ok({ ok: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to delete schedule item.");
  }
}
