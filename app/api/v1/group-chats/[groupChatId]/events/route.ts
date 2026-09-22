import { requireV1User } from "@/lib/api/v1/auth";
import { chatRealtimeSseResponse } from "@/lib/api/v1/chat-realtime";
import {
  chatRealtimeRetentionFloor,
  currentChatRealtimeSequence,
  isGroupChatRealtimeAuthorized,
  loadGroupChatRealtimeDeliveries,
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
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { groupChatId } = await params;
  if (!validId(groupChatId)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The group conversation identifier is invalid.",
      status: 422,
      field: "groupChatId",
    });
  }

  try {
    if (!(await isGroupChatRealtimeAuthorized(groupChatId, auth.user.id))) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The group conversation was not found.",
        status: 404,
      });
    }

    const conversation = { kind: "GROUP" as const, id: groupChatId };
    return await chatRealtimeSseResponse(request, {
      conversation,
      currentSequence: () => currentChatRealtimeSequence("GROUP", groupChatId),
      retentionFloor: () => chatRealtimeRetentionFloor("GROUP", groupChatId),
      isAuthorized: () => isGroupChatRealtimeAuthorized(groupChatId, auth.user.id),
      loadDeliveries: (after, take) =>
        loadGroupChatRealtimeDeliveries(groupChatId, auth.user.id, after, take),
    });
  } catch (cause) {
    console.error("GET /api/v1/group-chats/[groupChatId]/events", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to open the realtime group stream.",
      status: 500,
      retryable: true,
    });
  }
}
