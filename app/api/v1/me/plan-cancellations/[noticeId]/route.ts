import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { v1Success, v1Error } from "@/lib/api/v1/http";
import { acknowledgePlanCancellation } from "@/lib/api/v1/plan-cancellations";
import { PlansServiceError, mapPlansError } from "@/lib/api/v1/plans-service";
export const dynamic = "force-dynamic";
export async function PATCH(request: Request, {params}: {params: Promise<{noticeId:string}>}) {
 const auth = await requireV1User(request); if (!auth.ok) return auth.response;
 const {noticeId} = await params;
 const check = requireV1Cuid(request, noticeId, "noticeId"); if (!check.ok) return check.response;
 try { return v1Success(await acknowledgePlanCancellation(auth.user.id, noticeId), {request}); }
 catch(cause) { if(cause instanceof PlansServiceError) return v1Error(request, mapPlansError(cause)); console.error("Acknowledge plan cancellation failed", cause); return v1Error(request, {code:"INTERNAL_ERROR", message:"The notification could not be acknowledged.", status:500, retryable:true}); }
}
