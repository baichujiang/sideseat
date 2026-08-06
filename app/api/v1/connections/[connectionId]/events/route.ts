import { requireV1User } from "@/lib/api/v1/auth";
import { chatRealtimeSseResponse } from "@/lib/api/v1/chat-realtime";
import {
  chatRealtimeRetentionFloor,
  currentChatRealtimeSequence,
  isDirectChatRealtimeAuthorized,
  loadDirectChatRealtimeDeliveries,
} from "@/lib/api/v1/chat-realtime-service";
import { v1Error } from "@/lib/api/v1/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function validId(value: string) {
  return /^c[a-z0-9]{20,30}$/i.test(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { connectionId } = await params;
  if (!validId(connectionId)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The connection identifier is invalid.",
      status: 422,
      field: "connectionId",
    });
  }

  try {
    if (!(await isDirectChatRealtimeAuthorized(connectionId, auth.user.id))) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The conversation was not found.",
        status: 404,
      });
    }

    const conversation = { kind: "DIRECT" as const, id: connectionId };
    return await chatRealtimeSseResponse(request, {
      conversation,
      currentSequence: () => currentChatRealtimeSequence("DIRECT", connectionId),
      retentionFloor: () => chatRealtimeRetentionFloor("DIRECT", connectionId),
      isAuthorized: () => isDirectChatRealtimeAuthorized(connectionId, auth.user.id),
      loadDeliveries: (after, take) =>
        loadDirectChatRealtimeDeliveries(connectionId, after, take),
    });
  } catch (cause) {
    console.error("GET /api/v1/connections/[connectionId]/events", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to open the realtime conversation stream.",
      status: 500,
      retryable: true,
    });
  }
}
