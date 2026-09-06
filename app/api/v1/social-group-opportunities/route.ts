import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { isV2FeatureEnabled, isV2SmallGroupPilotUser } from "@/lib/v2/feature-flags";
import { listSmallGroupInvitations } from "@/lib/v2/social-groups";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!isV2FeatureEnabled("v2SmallGroupPilot") || !isV2SmallGroupPilotUser(auth.user)) {
    return v1Error(request, {
      code: "FEATURE_UNAVAILABLE",
      message: "The small-group pilot is not enabled for this account.",
      status: 404,
    });
  }
  try {
    return v1Success(
      { opportunities: await listSmallGroupInvitations(auth.user.id) },
      { request },
    );
  } catch (cause) {
    console.error("GET /api/v1/social-group-opportunities", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Small-group invitations could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
