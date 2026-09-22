import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import {
  PlansServiceError,
  getPlanRequest,
  mapPlansError,
} from "@/lib/api/v1/plans-service";
import { v1Error, v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ planId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { planId } = await params;
  const idCheck = requireV1Cuid(request, planId, "planId");
  if (!idCheck.ok) return idCheck.response;

  try {
    const plan = await getPlanRequest({ userId: auth.user.id, planId });
    return v1Success({ plan }, { request });
  } catch (cause) {
    if (cause instanceof PlansServiceError) {
      return v1Error(request, mapPlansError(cause));
    }
    console.error("GET /api/v1/plans/[planId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The plan could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
