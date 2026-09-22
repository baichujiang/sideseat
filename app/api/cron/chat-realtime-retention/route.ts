import { cleanupChatRealtimeEvents } from "@/lib/api/v1/chat-realtime-retention";
import { error, ok } from "@/lib/http";
import { runObservedCron } from "@/lib/ops/cron-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return error("Unauthorized.", 401);
  }

  try {
    return ok(
      await runObservedCron("chat-realtime-retention", () => cleanupChatRealtimeEvents()),
    );
  } catch (cause) {
    console.error("GET /api/cron/chat-realtime-retention", cause);
    return error("Realtime retention cleanup failed.", 500);
  }
}
