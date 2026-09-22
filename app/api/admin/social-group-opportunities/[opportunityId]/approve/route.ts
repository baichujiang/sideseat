import { requireAdminUser } from "@/lib/auth/guards";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { socialGroupApproveSchema } from "@/lib/validators/social-group";
import {
  SocialGroupError,
  approveSmallGroupOpportunity,
} from "@/lib/v2/social-groups";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const admin = await requireAdminUser();
  if (!isV2FeatureEnabled("v2SmallGroupPilot")) {
    return v1Error(request, {
      code: "FEATURE_UNAVAILABLE",
      message: "The small-group pilot is disabled.",
      status: 404,
    });
  }
  const parsed = await parseV1Json(request, socialGroupApproveSchema);
  if (!parsed.ok) return parsed.response;
  const { opportunityId } = await params;
  try {
    return v1Success(
      {
        opportunity: await approveSmallGroupOpportunity({
          adminUserId: admin.id,
          opportunityId,
          candidateUserIds: parsed.data.candidateUserIds,
        }),
      },
      { request },
    );
  } catch (cause) {
    if (cause instanceof SocialGroupError) {
      return v1Error(request, {
        code: cause.code === "NOT_FOUND" ? "NOT_FOUND" : "INVALID_REQUEST",
        message: cause.messageText,
        status: cause.code === "NOT_FOUND" ? 404 : 409,
      });
    }
    console.error("POST /api/admin/social-group-opportunities/[id]/approve", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The opportunity could not be approved.",
      status: 500,
      retryable: true,
    });
  }
}
