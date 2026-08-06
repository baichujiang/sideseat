import { syncLmuCourseCatalog } from "@/lib/courses/lmu-catalog-sync";
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
      await runObservedCron("lmu-course-catalog", () =>
        syncLmuCourseCatalog({ trigger: "CRON" }),
      ),
    );
  } catch (cause) {
    console.error("GET /api/cron/lmu-course-catalog", cause);
    return error("LMU course catalog sync failed.", 500);
  }
}
