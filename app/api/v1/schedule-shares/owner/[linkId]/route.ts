import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import {
  mapScheduleShareError,
  revokeScheduleShare,
  ScheduleShareServiceError,
} from "@/lib/api/v1/schedule-share-service";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { linkId } = await params;
  const idCheck = requireV1Cuid(request, linkId, "linkId");
  if (!idCheck.ok) return idCheck.response;

  try {
    const result = await revokeScheduleShare({ userId: auth.user.id, linkId });
    return v1Success(result, { request });
  } catch (cause) {
    if (cause instanceof ScheduleShareServiceError) {
      return v1Error(request, mapScheduleShareError(cause));
    }
    console.error("DELETE /api/v1/schedule-shares/owner/[linkId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The schedule share could not be revoked.",
      status: 500,
      retryable: true,
    });
  }
}
