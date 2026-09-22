import { requireV1User } from "@/lib/api/v1/auth";
import {
  ScheduleShareServiceError,
  getScheduleShareMyProposal,
  mapScheduleShareError,
} from "@/lib/api/v1/schedule-share-service";
import { v1Error, v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { token } = await params;
  const decoded = decodeURIComponent(token);
  if (!decoded.trim()) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The schedule share token is invalid.",
      status: 422,
      field: "token",
    });
  }

  try {
    const payload = await getScheduleShareMyProposal({
      userId: auth.user.id,
      token: decoded,
    });
    return v1Success(payload, { request });
  } catch (cause) {
    if (cause instanceof ScheduleShareServiceError) {
      return v1Error(request, mapScheduleShareError(cause));
    }
    console.error(
      "GET /api/v1/schedule-shares/recipient/[token]/my-proposal",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The proposal could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
