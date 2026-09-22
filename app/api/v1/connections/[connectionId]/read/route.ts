import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { markDirectConversationRead } from "@/lib/chat/direct-message-read-service";

function validConnectionId(value: string) {
  return /^c[a-z0-9]{20,30}$/i.test(value);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { connectionId } = await params;
  if (!validConnectionId(connectionId)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The connection identifier is invalid.",
      status: 422,
      field: "connectionId",
    });
  }

  try {
    const result = await markDirectConversationRead(connectionId, auth.user.id);
    if (!result) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The conversation was not found.",
        status: 404,
      });
    }
    return v1Success({ readAt: result.readAt.toISOString() }, { request });
  } catch (cause) {
    console.error("POST /api/v1/connections/[connectionId]/read", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to mark the conversation as read.",
      status: 500,
      retryable: true,
    });
  }
}
