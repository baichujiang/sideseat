import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { markGroupConversationRead } from "@/lib/chat/community-chat-service";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { groupChatId } = await params;
  if (!/^c[a-z0-9]{20,30}$/i.test(groupChatId)) {
    return v1Error(request, { code: "INVALID_REQUEST", message: "The group identifier is invalid.", status: 422, field: "groupChatId" });
  }
  try {
    const result = await markGroupConversationRead(prisma, groupChatId, auth.user.id);
    if (!result) {
      return v1Error(request, { code: "NOT_FOUND", message: "The group conversation was not found.", status: 404 });
    }
    return v1Success({ readAt: result.readAt.toISOString() }, { request });
  } catch (cause) {
    console.error("POST /api/v1/group-chats/[groupChatId]/read", cause);
    return v1Error(request, { code: "INTERNAL_ERROR", message: "Unable to mark the group conversation as read.", status: 500, retryable: true });
  }
}
