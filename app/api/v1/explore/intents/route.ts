import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import { listExploreIntents } from "@/lib/v2/explore-intents";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!isV2FeatureEnabled("v2ExploreIntents")) {
    return v1Error(request, { code: "FEATURE_UNAVAILABLE", message: "Explore is not available.", status: 404 });
  }
  try {
    const url = new URL(request.url);
    const parsed = Number(url.searchParams.get("limit") ?? "3");
    const limit = Number.isFinite(parsed) ? Math.trunc(parsed) : 3;
    return v1Success(await listExploreIntents(auth.user.id, limit), { request });
  } catch (cause) {
    console.error("GET /api/v1/explore/intents", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR", message: "Explore intentions could not be loaded.", status: 500, retryable: true,
    });
  }
}
