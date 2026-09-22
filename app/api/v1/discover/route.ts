import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { loadNativeDiscoverFeed } from "@/lib/api/v1/discover-service";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { DEFAULT_DISCOVER_SERVED_CITY } from "@/lib/discover/discover-city-name-keys";
import { isDiscoverServedCity } from "@/lib/discover/discover-served-cities";
import { evaluateActionCoordinationCapability } from "@/lib/v2/action-coordination/capability";
import { getCreatorGatedActionToPlanAssignment } from "@/lib/v2/experiments";

export const dynamic = "force-dynamic";

const querySchema = z.string().trim().max(80);

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

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
  const query = querySchema.safeParse(search.get("q") ?? "");
  if (!query.success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "Search must be at most 80 characters.",
      status: 422,
      field: "q",
    });
  }

  try {
    const capability = evaluateActionCoordinationCapability(request.headers);
    const assignment = await getCreatorGatedActionToPlanAssignment(
      auth.user,
      capability,
    );
    const feed = await loadNativeDiscoverFeed({
      userId: auth.user.id,
      city,
      query: query.data,
      coordinationViewer: { capability, assignment },
    });
    return v1Success(feed, { request });
  } catch (cause) {
    console.error("GET /api/v1/discover", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Discover could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
