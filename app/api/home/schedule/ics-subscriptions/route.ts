import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { loadIcsSubscriptionStudyEntries } from "@/lib/calendar/load-ics-subscription-entries";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

function parseWindowParam(value: string | null): Date | null {
  if (!value?.trim()) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed;
}

export async function GET(request: Request) {
  try {
    const auth = await resolveOnboardedUserForApi();
    if (!auth.ok) return error(auth.error, auth.status);

    const { searchParams } = new URL(request.url);
    const windowStart = parseWindowParam(searchParams.get("windowStart"));
    const windowEnd = parseWindowParam(searchParams.get("windowEnd"));
    if (!windowStart || !windowEnd) {
      return error("windowStart and windowEnd query params are required (ISO dates).");
    }
    if (windowStart > windowEnd) {
      return error("windowStart must be before windowEnd.");
    }

    const categories = await prisma.userCalendarCategory.findMany({
      where: { userId: auth.user.id },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        name: true,
        color: true,
        icsSubscriptionUrl: true,
      },
    });

    const studyEntries = await loadIcsSubscriptionStudyEntries({
      categories,
      windowStart,
      windowEnd,
    });

    return ok({ studyEntries });
  } catch (cause) {
    console.error(cause);
    return error("Could not load calendar subscriptions.", 500);
  }
}
