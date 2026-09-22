import { requireV1User } from "@/lib/api/v1/auth";
import {
  ConnectionActionsError,
  loadConnectionActions,
} from "@/lib/api/v1/connection-actions-service";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { v1Error, v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { connectionId } = await params;
  const idCheck = requireV1Cuid(request, connectionId, "connectionId");
  if (!idCheck.ok) return idCheck.response;

  try {
    const data = await loadConnectionActions({
      userId: auth.user.id,
      connectionId,
    });
    return v1Success(data, { request });
  } catch (cause) {
    if (cause instanceof ConnectionActionsError && cause.code === "NOT_FOUND") {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: cause.messageText,
        status: 404,
      });
    }
    console.error("GET /api/v1/connections/[connectionId]/actions", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Connection actions could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
