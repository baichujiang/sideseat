import { requireAdminUser } from "@/lib/auth/guards";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { socialGroupDraftSchema } from "@/lib/validators/social-group";
import { generateSmallGroupCandidates } from "@/lib/v2/social-groups";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";

export async function POST(request: Request) {
  await requireAdminUser();
  if (!isV2FeatureEnabled("v2SmallGroupPilot")) {
    return v1Error(request, {
      code: "FEATURE_UNAVAILABLE",
      message: "The small-group pilot is disabled.",
      status: 404,
    });
  }
  const parsed = await parseV1Json(request, socialGroupDraftSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return v1Success(
      {
        candidates: await generateSmallGroupCandidates({
          ...parsed.data,
          minimumMembers: parsed.data.minimumMembers ?? 3,
          maximumMembers: parsed.data.maximumMembers ?? 5,
        }),
      },
      { request },
    );
  } catch (cause) {
    console.error("POST /api/admin/social-group-opportunities/candidates", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Candidates could not be generated.",
      status: 500,
      retryable: true,
    });
  }
}
