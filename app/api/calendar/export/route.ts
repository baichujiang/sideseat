import { requireOnboardedUser } from "@/lib/auth/guards";
import {
  calendarExportFilename,
  parseCalendarExportYear,
} from "@/lib/calendar/calendar-export-window";
import { loadCalendarIcsExport } from "@/lib/calendar/load-calendar-ics-export";

export async function GET(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const now = new Date();
    const year = parseCalendarExportYear(
      new URL(request.url).searchParams.get("year"),
      now,
    );
    if (year === null) {
      return new Response("Invalid calendar export year.", { status: 400 });
    }
    const ics = await loadCalendarIcsExport(user, { now, year });

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": `attachment; filename="${calendarExportFilename(year)}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "digest" in cause &&
      typeof (cause as { digest?: unknown }).digest === "string" &&
      String((cause as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw cause;
    }
    console.error(cause);
    return new Response("Could not export calendar.", { status: 500 });
  }
}
