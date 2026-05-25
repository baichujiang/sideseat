import { ConnectionStatus, LanguageProficiency, LanguageTag } from "@prisma/client";

import { nicknameToKey } from "@/lib/auth/nickname-key";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_SCHOOL } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";

/** Stable system account for the default Chats assistant thread. */
export const ASSISTANT_BOT_USERNAME = "sideseat_assistant";

const WELCOME_MESSAGE_EN =
  "Hi! I'm the SideSeat assistant — product help only, not a real classmate.\n\nTap a quick question here or type your own. I'll point you to the right place in the app.";
const WELCOME_MESSAGE_ZH =
  "你好！我是 SideSeat 小助手，只做产品说明，不是真人同学。\n\n点这里的快捷问题，或直接输入；我会告诉你在应用里该怎么操作。";

export async function getOrCreateAssistantBotUser() {
  const existing = await prisma.user.findUnique({
    where: { username: ASSISTANT_BOT_USERNAME },
  });
  if (existing) return existing;

  const hashedPassword = await hashPassword(`bot_${ASSISTANT_BOT_USERNAME}_no_login`);
  return prisma.user.create({
    data: {
      username: ASSISTANT_BOT_USERNAME,
      email: null,
      isGuest: false,
      hashedPassword,
      nickname: "SideSeat Assistant",
      nicknameKey: nicknameToKey("SideSeat Assistant"),
      avatarUrl: "p01",
      school: DEFAULT_SCHOOL,
      major: "Assistant",
      semester: 1,
      onboardingComplete: true,
      userLanguages: {
        create: [{ tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT }],
      },
    },
  });
}

async function findActiveAssistantConnections(viewerUserId: string, botUserId: string) {
  return prisma.connection.findMany({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [
        { userAId: viewerUserId, userBId: botUserId },
        { userAId: botUserId, userBId: viewerUserId },
      ],
    },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      messages: { take: 1, select: { id: true } },
    },
  });
}

/** Merges duplicate assistant DMs (race from parallel ensure calls) into the oldest thread. */
async function absorbDuplicateAssistantConnections(primaryId: string, duplicateIds: string[]) {
  if (duplicateIds.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const dupId of duplicateIds) {
      await tx.message.updateMany({
        where: { connectionId: dupId },
        data: { connectionId: primaryId },
      });
      await tx.planRequest.updateMany({
        where: { connectionId: dupId },
        data: { connectionId: primaryId },
      });
      const dupFriend = await tx.friendLink.findUnique({
        where: { connectionId: dupId },
        select: { connectionId: true },
      });
      if (dupFriend) {
        const primaryFriend = await tx.friendLink.findUnique({
          where: { connectionId: primaryId },
          select: { connectionId: true },
        });
        if (!primaryFriend) {
          await tx.friendLink.update({
            where: { connectionId: dupId },
            data: { connectionId: primaryId },
          });
        } else {
          await tx.friendLink.delete({ where: { connectionId: dupId } });
        }
      }
      await tx.connection.delete({ where: { id: dupId } });
    }
  });
}

async function ensureWelcomeOnConnection(connectionId: string, botUserId: string) {
  const hasMessage = await prisma.message.findFirst({
    where: { connectionId },
    select: { id: true },
  });
  if (hasMessage) return;

  await prisma.message.create({
    data: {
      connectionId,
      senderId: botUserId,
      body: `${WELCOME_MESSAGE_EN}\n\n${WELCOME_MESSAGE_ZH}`,
    },
  });
}

/** Ensures a single ACTIVE DM with the assistant bot and a welcome message on first open. */
export async function ensureAssistantBotConnection(viewerUserId: string): Promise<string> {
  const bot = await getOrCreateAssistantBotUser();
  if (bot.id === viewerUserId) {
    const self = await prisma.connection.findFirst({
      where: { userAId: viewerUserId, userBId: viewerUserId, status: ConnectionStatus.ACTIVE },
      select: { id: true },
    });
    if (self) return self.id;
  }

  let connections = await findActiveAssistantConnections(viewerUserId, bot.id);

  if (connections.length === 0) {
    try {
      await prisma.connection.create({
        data: {
          userAId: viewerUserId,
          userBId: bot.id,
          status: ConnectionStatus.ACTIVE,
        },
      });
    } catch {
      /* concurrent create — resolved by refetch below */
    }
    connections = await findActiveAssistantConnections(viewerUserId, bot.id);
  }

  if (connections.length === 0) {
    throw new Error("Failed to ensure assistant bot connection.");
  }

  const primary = connections[0]!;
  const duplicateIds = connections.slice(1).map((c) => c.id);
  if (duplicateIds.length > 0) {
    await absorbDuplicateAssistantConnections(primary.id, duplicateIds);
  }

  await ensureWelcomeOnConnection(primary.id, bot.id);
  return primary.id;
}

export function isAssistantBotUser(user: { username: string }): boolean {
  return user.username === ASSISTANT_BOT_USERNAME;
}
