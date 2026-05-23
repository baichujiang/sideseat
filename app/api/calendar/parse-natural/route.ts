import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { ensureUserCalendarCategories } from "@/lib/calendar/default-user-calendar-categories";
import { parseNaturalLanguageSchedule } from "@/lib/calendar/parse-natural-language";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { parseNaturalScheduleRequestSchema } from "@/lib/validators/calendar-natural";

export async function POST(request: Request) {
  try {
    const auth = await resolveOnboardedUserForApi();
    if (!auth.ok) {
      return error(auth.error, auth.status);
    }
    if (auth.user.isGuest) {
      return error("Create an account to use natural language scheduling.", 403);
    }

    const parsed = parseBody(await request.json().catch(() => null), parseNaturalScheduleRequestSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }

    const locale: AppLocale = parsed.data.locale ?? "en";
    await ensureUserCalendarCategories(prisma, auth.user.id);
    const categoryRows = await prisma.userCalendarCategory.findMany({
      where: { userId: auth.user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: { id: true, name: true, presetKey: true },
    });
    const result = await parseNaturalLanguageSchedule({
      text: parsed.data.text,
      locale,
      categories: categoryRows.map((c) => ({
        id: c.id,
        name: c.name,
        presetKey: c.presetKey,
      })),
    });

    if (!result.ok) {
      if (result.code === "NOT_CONFIGURED") {
        return error("Natural language scheduling is not available right now.", 503);
      }
      return error(result.error, 422);
    }

    return ok(result.data);
  } catch (cause) {
    console.error(cause);
    return error("Unable to parse schedule.");
  }
}
