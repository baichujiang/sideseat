import { after } from "next/server";
import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { cancelPlan, cancellationPush, planCancellationSchema } from "@/lib/api/v1/plan-cancellations";
import { planRequestV1 } from "@/lib/api/v1/plans-dto";
import { PlansServiceError, mapPlansError } from "@/lib/api/v1/plans-service";
import { LegacyPlanTransitionConflictError } from "@/lib/plans/legacy-plan-commitment-compat";
import { notifyUserPush } from "@/lib/push/notify-user";
export const dynamic = "force-dynamic";
export async function POST(request: Request, { params }: { params: Promise<{ planId: string }> }) {
 const auth = await requireV1User(request); if (!auth.ok) return auth.response;
 const { planId } = await params;
 const check = requireV1Cuid(request, planId, "planId"); if (!check.ok) return check.response;
 const parsed = await parseV1Json(request, planCancellationSchema); if (!parsed.ok) return parsed.response;
 try {
  return await runIdempotentV1Mutation({request, actorId: auth.user.id, scope: `native-plan-cancel:${planId}`, requestBody: parsed.data,
   execute: async () => {
    const result = await cancelPlan(auth.user.id, planId, parsed.data);
    if (result.created) after(() => notifyUserPush(result.notice.recipientId, cancellationPush(result.notice)));
    return {status: 200, body: {plan: planRequestV1(result.notice.plan, auth.user.id)}};
   }});
 } catch (cause) {
  if (cause instanceof PlansServiceError) return v1Error(request, mapPlansError(cause));
  if (cause instanceof LegacyPlanTransitionConflictError) return v1Error(request, {code:"STATE_CONFLICT", message:cause.message, status:409});
  console.error("Cancel plan failed", cause);
  return v1Error(request, {code:"INTERNAL_ERROR", message:"The plan could not be canceled.", status:500, retryable:true});
 }
}
