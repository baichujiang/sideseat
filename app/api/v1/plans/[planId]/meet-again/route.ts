import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { PlansServiceError, mapPlansError, recordPlanMeetAgain } from "@/lib/api/v1/plans-service";

export const dynamic = "force-dynamic";
const schema = z.object({ value: z.enum(["YES", "NO", "WITHDRAWN"]) }).strict();

export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { planId } = await params;
  const idCheck = requireV1Cuid(request, planId, "planId");
  if (!idCheck.ok) return idCheck.response;
  const parsed = await parseV1Json(request, schema);
  if (!parsed.ok) return parsed.response;
  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `plan-meet-again:${planId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 200,
        body: { meetAgain: await recordPlanMeetAgain({
          userId: auth.user.id, planId, value: parsed.data.value,
        }) },
      }),
    });
  } catch (cause) {
    if (cause instanceof PlansServiceError) return v1Error(request, mapPlansError(cause));
    console.error("POST /api/v1/plans/[planId]/meet-again", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR", message: "Meet Again could not be saved.", status: 500, retryable: true,
    });
  }
}
