import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import {
  PlansServiceError,
  acceptPlanRequest,
  mapPlansError,
} from "@/lib/api/v1/plans-service";
import { v1Error } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { planId } = await params;
  const idCheck = requireV1Cuid(request, planId, "planId");
  if (!idCheck.ok) return idCheck.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-plan-accept:${planId}`,
      requestBody: {},
      execute: async () => ({
        status: 200,
        body: {
          plan: await acceptPlanRequest({ userId: auth.user.id, planId }),
        },
      }),
    });
  } catch (cause) {
    if (cause instanceof PlansServiceError) {
      return v1Error(request, mapPlansError(cause));
    }
    console.error("POST /api/v1/plans/[planId]/accept", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The plan could not be accepted.",
      status: 500,
      retryable: true,
    });
  }
}
