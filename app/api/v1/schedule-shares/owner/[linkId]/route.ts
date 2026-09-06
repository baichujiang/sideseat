import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import {
  getScheduleShareOwner,
  mapScheduleShareError,
  revokeScheduleShare,
  ScheduleShareServiceError,
  updateScheduleShare,
} from "@/lib/api/v1/schedule-share-service";
import { createScheduleShareSchema } from "@/lib/schedule-share/validation";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { linkId } = await params;
  const idCheck = requireV1Cuid(request, linkId, "linkId");
  if (!idCheck.ok) return idCheck.response;

  try {
    const result = await getScheduleShareOwner({
      userId: auth.user.id,
      linkId,
    });
    return v1Success(result, { request });
  } catch (cause) {
    if (cause instanceof ScheduleShareServiceError) {
      return v1Error(request, mapScheduleShareError(cause));
    }
    console.error("GET /api/v1/schedule-shares/owner/[linkId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The schedule share settings could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { linkId } = await params;
  const idCheck = requireV1Cuid(request, linkId, "linkId");
  if (!idCheck.ok) return idCheck.response;

  const parsed = await parseV1Json(request, createScheduleShareSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const result = await updateScheduleShare({
      userId: auth.user.id,
      linkId,
      input: parsed.data,
    });
    return v1Success(result, { request });
  } catch (cause) {
    if (cause instanceof ScheduleShareServiceError) {
      return v1Error(request, mapScheduleShareError(cause));
    }
    console.error("PATCH /api/v1/schedule-shares/owner/[linkId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The schedule share settings could not be saved.",
      status: 500,
      retryable: true,
    });
  }
}

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
