import { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { socialGroupResponseSchema } from "@/lib/validators/social-group";
import { isV2FeatureEnabled, isV2SmallGroupPilotUser } from "@/lib/v2/feature-flags";
import {
  SocialGroupError,
  respondToSmallGroupOpportunity,
} from "@/lib/v2/social-groups";

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
  const parsed = await parseV1Json(request, socialGroupResponseSchema);
  if (!parsed.ok) return parsed.response;
  const { opportunityId } = await params;
  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `small-group-response:${opportunityId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 200,
        body: (await respondToSmallGroupOpportunity({
          userId: auth.user.id,
          opportunityId,
          status: parsed.data.status,
        })) as Prisma.InputJsonObject,
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
    console.error("POST /api/v1/social-group-opportunities/[id]/response", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Your response could not be saved.",
      status: 500,
      retryable: true,
    });
  }
}
