import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
import { isDiscoverServedCity } from "@/lib/discover/discover-served-cities";
import { getActionToPlanAssignment } from "@/lib/v2/experiments";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import { loadActionRecommendations } from "@/lib/v2/recommendations";

export const dynamic = "force-dynamic";

const limitSchema = z.coerce.number().int().min(1).max(30).default(30);

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const assignment = await getActionToPlanAssignment(auth.user);
  if (
    !isV2FeatureEnabled("v2Recommendations") ||
    !assignment.eligible ||
    assignment.variant !== "TREATMENT"
  ) {
    return v1Error(request, {
      code: "FEATURE_UNAVAILABLE",
      message: "Recommendations are not enabled for this account.",
      status: 404,
    });
  }
  const search = new URL(request.url).searchParams;
  const city = search.get("city") ?? DEFAULT_DISCOVER_SERVED_CITY;
  if (!isDiscoverServedCity(city)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "Choose a supported Discover city.",
      status: 422,
      field: "city",
    });
  }
  const limit = limitSchema.safeParse(search.get("limit") ?? "30");
  if (!limit.success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "Limit must be between 1 and 30.",
      status: 422,
      field: "limit",
    });
  }
  try {
    return v1Success(
      await loadActionRecommendations({
        userId: auth.user.id,
        city,
        limit: limit.data,
      }),
      { request },
    );
  } catch (cause) {
    console.error("GET /api/v1/discover/recommendations", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Recommendations could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
