import { requireOnboardedUser } from "@/lib/auth/guards";
import { loadCalendarIcsExport } from "@/lib/calendar/load-calendar-ics-export";

export async function GET() {
  try {
    const user = await requireOnboardedUser();
    const ics = await loadCalendarIcsExport(user);

    return new Response(ics, {
      status: 200,
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="sideseat-schedule.ics"',
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
