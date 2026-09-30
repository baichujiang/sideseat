import { error, ok } from "@/lib/http";
import { runObservedCron } from "@/lib/ops/cron-observability";
import { cleanupStudentVerificationData } from "@/lib/verification/retention";
import { processMediaDeletionJobs, sweepUnreferencedMedia } from "@/lib/media/lifecycle";

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
      await runObservedCron("student-verification-retention", async () => {
        const verification = await cleanupStudentVerificationData();
        const sweep = await sweepUnreferencedMedia({ batchSize: 500 });
        const deletion = await processMediaDeletionJobs({ limit: 200 });
        if (deletion.failed) throw new Error(`${deletion.failed} media deletions queued for retry.`);
        return { ...verification, media: { ...sweep, ...deletion } };
      }),
    );
  } catch (cause) {
    console.error("GET /api/cron/student-verification-retention", cause);
    return error("Student verification retention cleanup failed.", 500);
  }
}
