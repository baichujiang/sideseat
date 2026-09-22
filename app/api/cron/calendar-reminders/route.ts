import { runCalendarReminderCron } from "@/lib/push/calendar-reminder-cron";
import { error, ok } from "@/lib/http";
import { runObservedCron } from "@/lib/ops/cron-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return error("Unauthorized.", 401);
  }

  try {
    const result = await runObservedCron("calendar-reminders", () => runCalendarReminderCron());
    return ok(result);
  } catch (cause) {
    console.error(cause);
    return error("Cron failed.", 500);
  }
}
