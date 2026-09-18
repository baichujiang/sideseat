import type { Prisma } from "@prisma/client";
import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { v1Error } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { requirePersistentIntentSupport } from "@/lib/api/v1/persistent-intents";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import { expressExploreInterest, MutualOpportunityError } from "@/lib/v2/mutual-opportunities";
import { scheduleNewDirectChatMessageNotification } from "@/lib/push/notify-user";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ intentId: string }> }) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const unsupported = requirePersistentIntentSupport(request);
  if (unsupported) return unsupported;
  if (!isV2FeatureEnabled("v2ExploreIntents") || !isV2FeatureEnabled("v2WeeklyIntent") ||
      !isV2FeatureEnabled("v2MutualOpportunity")) {
    return v1Error(request, { code: "FEATURE_UNAVAILABLE", message: "Explore interest is not available.", status: 404 });
  }
  const { intentId } = await params;
  const id = requireV1Cuid(request, intentId, "intentId");
  if (!id.ok) return id.response;
  try {
    return await runIdempotentV1Mutation({ request, actorId: auth.user.id,
      scope: `explore-intent-interest:${intentId}`, requestBody: { intentId },
      execute: async () => {
        const result = await expressExploreInterest(auth.user.id, intentId);
        const opportunity = result.opportunity;
        if (result.activated && opportunity.coordination) {
          scheduleNewDirectChatMessageNotification({ connectionId: opportunity.coordination.connectionId,
            senderId: auth.user.id, bodyPreview: "You can plan this together now." });
        }
        return { status: 200, body: opportunity as unknown as Prisma.InputJsonValue };
      },
    });
  } catch (cause) {
    if (cause instanceof MutualOpportunityError) return v1Error(request, {
      code: cause.code === "NOT_FOUND" ? "NOT_FOUND" : "STATE_CONFLICT",
      message: "This opportunity is no longer available. Refresh Explore to see current activities.",
      status: cause.code === "NOT_FOUND" ? 404 : 409,
    });
    console.error("POST /api/v1/explore/intents/[intentId]/interest", cause);
    return v1Error(request, { code: "INTERNAL_ERROR", message: "Your interest could not be saved.", status: 500, retryable: true });
  }
}
