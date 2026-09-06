import { PlanOutcomeValue } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import {
  PlansServiceError,
  mapPlansError,
  recordPlanOutcome,
} from "@/lib/api/v1/plans-service";

export const dynamic = "force-dynamic";

const outcomeSchema = z.object({ value: z.nativeEnum(PlanOutcomeValue) }).strict();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { planId } = await params;
  const idCheck = requireV1Cuid(request, planId, "planId");
  if (!idCheck.ok) return idCheck.response;
  const parsed = await parseV1Json(request, outcomeSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `plan-outcome:${planId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 200,
        body: {
          outcome: await recordPlanOutcome({
            userId: auth.user.id,
            planId,
            value: parsed.data.value,
          }),
        },
      }),
    });
  } catch (cause) {
    if (cause instanceof PlansServiceError) {
      return v1Error(request, mapPlansError(cause));
    }
    console.error("POST /api/v1/plans/[planId]/outcome", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Plan outcome could not be recorded.",
      status: 500,
      retryable: true,
    });
  }
}
