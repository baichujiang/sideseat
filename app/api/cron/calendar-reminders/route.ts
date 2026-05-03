import { runCalendarReminderCron } from "@/lib/push/calendar-reminder-cron";
import { error, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return error("Unauthorized.", 401);
  }

  try {
    const result = await runCalendarReminderCron();
    return ok(result);
  } catch (cause) {
    console.error(cause);
    return error("Cron failed.", 500);
  }
}
