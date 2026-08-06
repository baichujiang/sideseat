import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { loadNativeDiscoverActivityDetail } from "@/lib/api/v1/discover-service";
import { v1Error, v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

const activityIdSchema = z.string().cuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { activityId } = await params;
  if (!activityIdSchema.safeParse(activityId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The activity identifier is invalid.",
      status: 422,
      field: "activityId",
    });
  }

  try {
    const detail = await loadNativeDiscoverActivityDetail({
      userId: auth.user.id,
      activityId,
    });
    if (!detail) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The activity was not found.",
        status: 404,
      });
    }
    return v1Success(detail, { request });
  } catch (cause) {
    console.error("GET /api/v1/discover/activities/[activityId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The activity could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
