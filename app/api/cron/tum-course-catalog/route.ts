import { syncTumCourseCatalog } from "@/lib/courses/tum-catalog-sync";
import { error, ok } from "@/lib/http";
import { runObservedCron } from "@/lib/ops/cron-observability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const authorization = request.headers.get("authorization");
  if (!secret || authorization !== `Bearer ${secret}`) {
    return error("Unauthorized.", 401);
  }

  try {
    return ok(
      await runObservedCron("tum-course-catalog", () =>
        syncTumCourseCatalog({ trigger: "CRON" }),
      ),
    );
  } catch (cause) {
    console.error("GET /api/cron/tum-course-catalog", cause);
    return error("TUM course catalog sync failed.", 500);
  }
}
