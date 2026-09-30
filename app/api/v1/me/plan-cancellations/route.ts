import { requireV1User } from "@/lib/api/v1/auth";
import { v1Success, v1Error } from "@/lib/api/v1/http";
import { unreadPlanCancellations } from "@/lib/api/v1/plan-cancellations";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
 const auth = await requireV1User(request); if (!auth.ok) return auth.response;
 try { return v1Success({notices: await unreadPlanCancellations(auth.user.id)}, {request}); }
 catch(cause) {
  console.error("List plan cancellations failed", cause);
  return v1Error(request, {code:"INTERNAL_ERROR", message:"Plan updates could not be loaded.", status:500, retryable:true});
 }
}
