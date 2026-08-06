import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { loadCalendarIcsExport } from "@/lib/calendar/load-calendar-ics-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  try {
    const ics = await loadCalendarIcsExport(auth.user);
    return v1Success(
      {
        filename: "sideseat-schedule.ics",
        mediaType: "text/calendar; charset=utf-8",
        ics,
      },
      { request },
    );
  } catch (cause) {
    console.error("GET /api/v1/calendar/export", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The calendar could not be exported.",
      status: 500,
      retryable: true,
    });
  }
}
