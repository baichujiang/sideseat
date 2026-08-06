import { replyAfterUserMessageToAssistant } from "@/lib/assistant/reply-after-user-message";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { notifyNewDirectChatMessage } from "@/lib/push/notify-user";
import { directMessageSchema, type DirectMessageInput } from "@/lib/validators/invitation";
import {
  activeDirectConnectionWhere,
  createDirectMessageRecord,
  InvalidDirectMessageImageError,
  PeerReplyRequiredError,
} from "@/lib/chat/direct-message-service";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { connectionId } = await params;
    const values = (await parseJson(
      request,
      directMessageSchema,
    )) as DirectMessageInput;

    const connection = await prisma.connection.findFirst({
      where: activeDirectConnectionWhere(connectionId, user.id),
      select: { id: true },
    });

    if (!connection) {
      return error("Connection not found.", 404);
    }

    const { message, bodyPreview } = await prisma.$transaction((tx) =>
      createDirectMessageRecord(tx, {
        connectionId,
        senderId: user.id,
        input: values,
      }),
    );
    void notifyNewDirectChatMessage({
      connectionId,
      senderId: user.id,
      bodyPreview,
    }).catch(() => {});

    if (values.type === "TEXT") {
      const locale = await getServerAppLocale();
      await replyAfterUserMessageToAssistant({
        connectionId,
        senderUserId: user.id,
        messageBody: values.body.trim(),
        locale,
      }).catch((err) => {
        console.error("[assistant] reply failed", err);
      });
    }

    return ok(message, { status: 201 });
  } catch (cause) {
    if (cause instanceof InvalidDirectMessageImageError) {
      return error("Invalid image.", 400);
    }
    if (cause instanceof PeerReplyRequiredError) {
      return error(cause.message, 403, "PEER_REPLY_REQUIRED");
    }
    console.error(cause);
    return error("Unable to send message.");
  }
}
