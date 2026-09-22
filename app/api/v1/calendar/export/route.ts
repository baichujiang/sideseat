import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import {
  calendarExportFilename,
  MAX_CALENDAR_EXPORT_YEAR,
  MIN_CALENDAR_EXPORT_YEAR,
  parseCalendarExportYear,
} from "@/lib/calendar/calendar-export-window";
import { loadCalendarIcsExport } from "@/lib/calendar/load-calendar-ics-export";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const now = new Date();
  const year = parseCalendarExportYear(
    new URL(request.url).searchParams.get("year"),
    now,
  );
  if (year === null) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: `year must be a four-digit integer from ${MIN_CALENDAR_EXPORT_YEAR} to ${MAX_CALENDAR_EXPORT_YEAR}.`,
      status: 422,
      field: "year",
    });
  }

  try {
    const ics = await loadCalendarIcsExport(auth.user, { now, year });
    return v1Success(
      {
        filename: calendarExportFilename(year),
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
