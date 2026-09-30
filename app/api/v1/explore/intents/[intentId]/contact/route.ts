import type { Prisma } from "@prisma/client";
import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { v1Error } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { requirePersistentIntentSupport } from "@/lib/api/v1/persistent-intents";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import { prepareExploreOpportunity, MutualOpportunityError } from "@/lib/v2/mutual-opportunities";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ intentId: string }> }) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const unsupported = requirePersistentIntentSupport(request);
  if (unsupported) return unsupported;
  if (!isV2FeatureEnabled("v2ExploreIntents") || !isV2FeatureEnabled("v2WeeklyIntent") ||
      !isV2FeatureEnabled("v2MutualOpportunity")) {
    return v1Error(request, { code: "FEATURE_UNAVAILABLE", message: "Explore contact is not available.", status: 404 });
  }
  const { intentId } = await params;
  const id = requireV1Cuid(request, intentId, "intentId");
  if (!id.ok) return id.response;
  try {
    return await runIdempotentV1Mutation({ request, actorId: auth.user.id,
      scope: `explore-intent-contact:${intentId}`, requestBody: { intentId },
      execute: async () => {
        const opportunity = await prepareExploreOpportunity(auth.user.id, intentId);
        return { status: 200, body: opportunity as unknown as Prisma.InputJsonValue };
      },
    });
  } catch (cause) {
    if (cause instanceof MutualOpportunityError) return v1Error(request, {
      code: cause.code === "NOT_FOUND" ? "NOT_FOUND" : "STATE_CONFLICT",
      message: "This opportunity is no longer available. Refresh Explore to see current activities.",
      status: cause.code === "NOT_FOUND" ? 404 : 409,
    });
    console.error("POST /api/v1/explore/intents/[intentId]/contact", cause);
    return v1Error(request, { code: "INTERNAL_ERROR", message: "This intention could not be opened.", status: 500, retryable: true });
  }
}
