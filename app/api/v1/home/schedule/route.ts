import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";
import { loadHomeSchedulePayload } from "@/lib/home/load-home-schedule-payload";

export const dynamic = "force-dynamic";

const MAX_WINDOW_MILLISECONDS = 120 * 24 * 60 * 60 * 1000;

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
  if (windowEnd <= windowStart) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "windowEnd must be after windowStart.",
      field: "windowEnd",
      status: 422,
    });
  }
  if (windowEnd.getTime() - windowStart.getTime() > MAX_WINDOW_MILLISECONDS) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The schedule window cannot exceed 120 days.",
      field: "windowEnd",
      status: 422,
    });
  }

  try {
    const payload = await loadHomeSchedulePayload({
      prisma,
      userId: auth.user.id,
      windowStart,
      windowEnd,
    });
    return v1Success(
      {
        window: {
          start: windowStart.toISOString(),
          end: windowEnd.toISOString(),
          timeZone: "Europe/Berlin",
        },
        ...payload,
      },
      { request },
    );
  } catch (error) {
    console.error("Failed to load API v1 Home schedule", error);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The schedule could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
