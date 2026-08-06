import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { loadIcsSubscriptionStudyEntries } from "@/lib/calendar/load-ics-subscription-entries";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const MAX_WINDOW_MILLISECONDS = 120 * 24 * 60 * 60 * 1000;
const MAX_FEED_WAIT_MILLISECONDS = 5_000;

function parseDate(value: string | null) {
  if (!value?.trim()) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const search = new URL(request.url).searchParams;
  const windowStart = parseDate(search.get("windowStart"));
  if (!windowStart) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "windowStart must be a valid ISO 8601 date.",
      field: "windowStart",
      status: 422,
    });
  }
  const windowEnd = parseDate(search.get("windowEnd"));
  if (!windowEnd) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "windowEnd must be a valid ISO 8601 date.",
      field: "windowEnd",
      status: 422,
    });
  }
  if (windowEnd <= windowStart || windowEnd.getTime() - windowStart.getTime() > MAX_WINDOW_MILLISECONDS) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The subscription window must be positive and cannot exceed 120 days.",
      field: "windowEnd",
      status: 422,
    });
  }

  try {
    const categories = await prisma.userCalendarCategory.findMany({
      where: { userId: auth.user.id, icsSubscriptionUrl: { not: null } },
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
      maxWaitMs: MAX_FEED_WAIT_MILLISECONDS,
    });
    return v1Success({ studyEntries }, { request });
  } catch (cause) {
    console.error("GET /api/v1/home/schedule/ics-subscriptions", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Calendar subscriptions could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
