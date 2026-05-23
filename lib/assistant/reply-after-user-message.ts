import "server-only";

import { ConnectionStatus, MessageType } from "@prisma/client";

import { getOrCreateAssistantBotUser, isAssistantBotUser } from "@/lib/auth/assistant-bot";
import { resolveAssistantReply } from "@/lib/assistant/resolve-reply";
import { serializeAssistantMessage } from "@/lib/assistant/message-payload";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { prisma } from "@/lib/db/prisma";
import { notifyNewDirectChatMessage } from "@/lib/push/notify-user";

/** Creates a FAQ-based assistant reply after the user sends TEXT in the bot DM. */
export async function replyAfterUserMessageToAssistant(params: {
  connectionId: string;
  senderUserId: string;
  messageBody: string;
  locale: AppLocale;
}): Promise<void> {
  const trimmed = params.messageBody.trim();
  if (!trimmed) return;

  const bot = await getOrCreateAssistantBotUser();

  const connection = await prisma.connection.findFirst({
    where: {
      id: params.connectionId,
      status: ConnectionStatus.ACTIVE,
      OR: [{ userAId: params.senderUserId }, { userBId: params.senderUserId }],
    },
    select: {
      userAId: true,
      userBId: true,
      userA: {
        select: {
          id: true,
          username: true,
          isGuest: true,
          verifiedStudent: true,
          studentVerificationStatus: true,
        },
      },
      userB: {
        select: {
          id: true,
          username: true,
          isGuest: true,
          verifiedStudent: true,
          studentVerificationStatus: true,
        },
      },
    },
  });

  if (!connection) return;

  const peer =
    connection.userAId === params.senderUserId ? connection.userB : connection.userA;
  const viewer =
    connection.userAId === params.senderUserId ? connection.userA : connection.userB;

  if (!isAssistantBotUser(peer) || viewer.id !== params.senderUserId) return;

  const payload = resolveAssistantReply({
    body: trimmed,
    locale: params.locale,
    viewer: {
      isGuest: viewer.isGuest,
      verifiedStudent: viewer.verifiedStudent,
      studentVerificationStatus: viewer.studentVerificationStatus,
    },
  });

  const body = serializeAssistantMessage(payload);

  await prisma.message.create({
    data: {
      connectionId: params.connectionId,
      senderId: bot.id,
      body,
      type: MessageType.TEXT,
    },
  });

  await notifyNewDirectChatMessage({
    connectionId: params.connectionId,
    senderId: bot.id,
    bodyPreview: payload.text,
  }).catch(() => {});
}
