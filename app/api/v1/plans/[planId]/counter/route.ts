import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import {
  PlansServiceError,
  counterProposePlanRequest,
  mapPlansError,
} from "@/lib/api/v1/plans-service";
import { counterProposeSchema } from "@/lib/validators/chat-planning";

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

  const parsed = await parseV1Json(request, counterProposeSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-plan-counter:${planId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 201,
        body: {
          plan: await counterProposePlanRequest({
            userId: auth.user.id,
            planId,
            title: parsed.data.title,
            location: parsed.data.location,
            message: parsed.data.message,
            startTime: parsed.data.startTime,
            endTime: parsed.data.endTime,
            planType: parsed.data.planType,
          }),
        },
      }),
    });
  } catch (cause) {
    if (cause instanceof PlansServiceError) {
      return v1Error(request, mapPlansError(cause));
    }
    console.error("POST /api/v1/plans/[planId]/counter", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Another time could not be suggested.",
      status: 500,
      retryable: true,
    });
  }
}
