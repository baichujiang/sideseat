import { ConnectionStatus, MessageType } from "@prisma/client";

import { replyAfterUserMessageToAssistant } from "@/lib/assistant/reply-after-user-message";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { isAllowedChatImageUrl } from "@/lib/constants/chat-media";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { notifyNewDirectChatMessage } from "@/lib/push/notify-user";
import { directMessageSchema, type DirectMessageInput } from "@/lib/validators/invitation";

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
      where: {
        id: connectionId,
        status: ConnectionStatus.ACTIVE,
        userA: {
          moderationBlocks: {
            none: {
              isActive: true,
            },
          },
        },
        userB: {
          moderationBlocks: {
            none: {
              isActive: true,
            },
          },
        },
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
    });

    if (!connection) {
      return error("Connection not found.", 404);
    }

    let replyToId: string | null = null;
    if (values.replyToId) {
      const target = await prisma.message.findFirst({
        where: {
          id: values.replyToId,
          connectionId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (target) replyToId = target.id;
    }

    let bodyPreview: string;

    if (values.type === "TEXT") {
      const body = values.body.trim();
      bodyPreview = body;
      const message = await prisma.message.create({
        data: {
          connectionId,
          senderId: user.id,
          body,
          type: MessageType.TEXT,
          replyToId,
        },
      });
      void notifyNewDirectChatMessage({
        connectionId,
        senderId: user.id,
        bodyPreview,
      }).catch(() => {});

      const locale = await getServerAppLocale();
      await replyAfterUserMessageToAssistant({
        connectionId,
        senderUserId: user.id,
        messageBody: body,
        locale,
      }).catch((err) => {
        console.error("[assistant] reply failed", err);
      });

      return ok(message, { status: 201 });
    }

    if (values.type === "IMAGE") {
      if (!isAllowedChatImageUrl(connectionId, values.imageUrl)) {
        return error("Invalid image.", 400);
      }
      const caption = (values.body ?? "").trim();
      bodyPreview = caption || "Photo";
      const message = await prisma.message.create({
        data: {
          connectionId,
          senderId: user.id,
          body: caption,
          type: MessageType.IMAGE,
          imageUrl: values.imageUrl,
          replyToId,
        },
      });
      void notifyNewDirectChatMessage({
        connectionId,
        senderId: user.id,
        bodyPreview,
      }).catch(() => {});
      return ok(message, { status: 201 });
    }

    const caption = (values.body ?? "").trim();
    const name =
      values.locationName && values.locationName.trim().length > 0
        ? values.locationName.trim()
        : null;
    bodyPreview = caption || name || "Location";
    const message = await prisma.message.create({
      data: {
        connectionId,
        senderId: user.id,
        body: caption,
        type: MessageType.LOCATION,
        locationLat: values.locationLat,
        locationLng: values.locationLng,
        locationName: name,
        replyToId,
      },
    });
    void notifyNewDirectChatMessage({
      connectionId,
      senderId: user.id,
      bodyPreview,
    }).catch(() => {});

    return ok(message, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to send message.");
  }
}
