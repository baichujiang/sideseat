import { requireGroupChatParticipant } from "@/lib/auth/guards";
import { createGroupChatMessageRecord } from "@/lib/chat/community-chat-service";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { notifyNewGroupChatMessage } from "@/lib/push/notify-user";
import { messageSchema } from "@/lib/validators/invitation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  try {
    const { groupChatId } = await params;
    const { user } = await requireGroupChatParticipant(groupChatId);
    const values = await parseJson(request, messageSchema);
    const result = await createGroupChatMessageRecord(prisma, {
      groupChatId,
      senderId: user.id,
      body: values.body,
    });
    if (result.kind === "not_found") {
      return error("Group chat not found.", 404);
    }
    if (result.kind === "restricted") {
      return error("Your account cannot send messages right now.", 403);
    }
    const body = values.body.trim();
    void notifyNewGroupChatMessage({
      groupChatId,
      title: result.notificationTitle,
      senderId: user.id,
      bodyPreview: body,
    }).catch(() => {});

    return ok(result.message, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to send message.");
  }
}
