import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { socialPreferencesPatchSchema } from "@/lib/validators/social-preferences";
import {
  loadSocialPreferences,
  updateSocialPreferences,
} from "@/lib/v2/social-preferences";
import { isV2FeatureEnabled, isV2PilotUser } from "@/lib/v2/feature-flags";

export const dynamic = "force-dynamic";

function unavailable(request: Request) {
  return v1Error(request, {
    code: "FEATURE_UNAVAILABLE",
    message: "Social preferences are not available.",
    status: 404,
  });
}

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!isV2FeatureEnabled("v2SocialPreferences") || !isV2PilotUser(auth.user)) {
    return unavailable(request);
  }
  try {
    return v1Success(await loadSocialPreferences(auth.user.id), { request });
  } catch (cause) {
    console.error("GET /api/v1/me/social-preferences", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Social preferences could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!isV2FeatureEnabled("v2SocialPreferences") || !isV2PilotUser(auth.user)) {
    return unavailable(request);
  }
  const parsed = await parseV1Json(request, socialPreferencesPatchSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return v1Success(
      await updateSocialPreferences(auth.user.id, parsed.data),
      { request },
    );
  } catch (cause) {
    if (cause instanceof Error && cause.message === "SOCIAL_PREFERENCE_EXPIRY_INVALID") {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "This week's preferences must expire within the next 14 days.",
        status: 422,
        field: "activeUntil",
      });
    }
    console.error("PATCH /api/v1/me/social-preferences", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Social preferences could not be saved.",
      status: 500,
      retryable: true,
    });
  }
}
