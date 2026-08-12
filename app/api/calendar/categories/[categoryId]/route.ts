import { requireOnboardedUser } from "@/lib/auth/guards";
import {
  BuiltInCalendarSubscriptionError,
  CalendarCategoryNotFoundError,
  deleteCalendarCategoryForUser,
  InvalidCalendarSubscriptionError,
  normalizeCalendarCategoryPatchInput,
  updateCalendarCategoryForUser,
} from "@/lib/calendar/calendar-category-service";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { calendarCategoryPatchSchema } from "@/lib/validators/calendar";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { categoryId } = await params;
    const body = await parseJson(request, calendarCategoryPatchSchema);
    if (
      body.name === undefined &&
      body.color === undefined &&
      body.icsSubscriptionUrl === undefined
    ) {
      return error("Nothing to update.");
    }

    const row = await updateCalendarCategoryForUser(prisma, {
      categoryId,
      userId: user.id,
      input: normalizeCalendarCategoryPatchInput(body),
    });
    return ok(row);
  } catch (cause) {
    if (cause instanceof CalendarCategoryNotFoundError) {
      return error("Calendar not found.", 404);
    }
    if (cause instanceof BuiltInCalendarSubscriptionError) {
      return error("Subscription feeds can only be used on custom calendars.");
    }
    if (cause instanceof InvalidCalendarSubscriptionError) {
      return error(cause.message);
    }
    console.error(cause);
    return error("Could not update calendar.");
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { categoryId } = await params;

    await deleteCalendarCategoryForUser(prisma, { categoryId, userId: user.id });
    return ok({ ok: true });
  } catch (cause) {
    if (cause instanceof CalendarCategoryNotFoundError) {
      return error("Calendar not found.", 404);
    }
    console.error(cause);
    return error("Could not delete calendar.");
  }
}
