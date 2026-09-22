import { requireOnboardedUser } from "@/lib/auth/guards";
import {
  createCalendarCategoryForUser,
  InvalidCalendarSubscriptionError,
  listCalendarCategoriesForUser,
  normalizeCalendarCategoryCreateInput,
} from "@/lib/calendar/calendar-category-service";
import { ensureUserCalendarCategories } from "@/lib/calendar/default-user-calendar-categories";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { calendarCategoryCreateSchema } from "@/lib/validators/calendar";

export async function GET() {
  try {
    const user = await requireOnboardedUser();
    const rows = await listCalendarCategoriesForUser(prisma, user.id);
    return ok(rows);
  } catch (cause) {
    console.error(cause);
    return error("Could not load calendars.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const body = await parseJson(request, calendarCategoryCreateSchema);
    await ensureUserCalendarCategories(prisma, user.id);
    const row = await createCalendarCategoryForUser(prisma, {
      userId: user.id,
      input: normalizeCalendarCategoryCreateInput(body),
    });
    return ok(row, { status: 201 });
  } catch (cause) {
    if (cause instanceof InvalidCalendarSubscriptionError) {
      return error(cause.message);
    }
    console.error(cause);
    return error("Could not create calendar.");
  }
}
