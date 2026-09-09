import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import { matchAndNotifyForUser } from "@/lib/v2/mutual-opportunity-auto-match";
import { listMutualOpportunities } from "@/lib/v2/mutual-opportunities";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  try {
    const generate =
      isV2FeatureEnabled("v2WeeklyIntent") &&
      isV2FeatureEnabled("v2MutualOpportunity");
    if (generate) await matchAndNotifyForUser(auth.user.id);
    const payload = await listMutualOpportunities(auth.user.id, false);
    if (request.headers.get("X-SideSeat-Discovery-Matching") !== "1") {
      payload.opportunities = payload.opportunities.filter(row => row.matchFit?.policyVersion !== "DISCOVERY_FIT_V1");
    }
    // Shipped clients require concrete timestamps and V1 score components.
    if (request.headers.get("X-SideSeat-Flexible-Timing") !== "1") {
      payload.opportunities = payload.opportunities.filter(row => row.startsAt && row.endsAt)
        .map(row => ({ ...row, matchFit: row.matchFit?.policyVersion === "ACTIVITY_FIT_V2" ? null : row.matchFit }));
    }
    return v1Success(payload, {
      request,
    });
  } catch (cause) {
    console.error("GET /api/v1/me/mutual-opportunities", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Together opportunities could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
