import { requireV1User } from "@/lib/api/v1/auth";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { socialGroupOutcomeSchema } from "@/lib/validators/social-group";
import {
  SocialGroupError,
  recordSmallGroupOutcome,
} from "@/lib/v2/social-groups";
import { isV2FeatureEnabled, isV2SmallGroupPilotUser } from "@/lib/v2/feature-flags";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!isV2FeatureEnabled("v2SmallGroupPilot") || !isV2SmallGroupPilotUser(auth.user)) {
    return v1Error(request, {
      code: "FEATURE_UNAVAILABLE",
      message: "The small-group pilot is not enabled for this account.",
      status: 404,
    });
  }
  const parsed = await parseV1Json(request, socialGroupOutcomeSchema);
  if (!parsed.ok) return parsed.response;
  const { opportunityId } = await params;
  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `small-group-outcome:${opportunityId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 200,
        body: {
          outcome: await recordSmallGroupOutcome({
            userId: auth.user.id,
            opportunityId,
            value: parsed.data.value,
          }),
        },
      }),
    });
  } catch (cause) {
    if (cause instanceof SocialGroupError) {
      return v1Error(request, {
        code: cause.code === "NOT_FOUND" ? "NOT_FOUND" : "INVALID_REQUEST",
        message: cause.messageText,
        status: cause.code === "NOT_FOUND" ? 404 : 409,
      });
    }
    console.error("POST /api/v1/social-group-opportunities/[id]/outcome", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Outcome feedback could not be saved.",
      status: 500,
      retryable: true,
    });
  }
}
