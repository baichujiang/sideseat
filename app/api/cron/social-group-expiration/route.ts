import { error, ok } from "@/lib/http";
import { runObservedCron } from "@/lib/ops/cron-observability";
import { expireSmallGroupOpportunities } from "@/lib/v2/social-groups";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return error("Unauthorized.", 401);
  }
  try {
    return ok(
      await runObservedCron("social-group-expiration", () =>
        expireSmallGroupOpportunities(),
      ),
    );
  } catch (cause) {
    console.error(cause);
    return error("Cron failed.", 500);
  }
}
