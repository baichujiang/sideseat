import { ConnectionStatus, LanguageProficiency, LanguageTag } from "@prisma/client";

import { serializeAssistantMessage } from "@/lib/assistant/message-payload";
import { buildAssistantWelcomePayload } from "@/lib/assistant/welcome";
import { nicknameToKey } from "@/lib/auth/nickname-key";
import { hashPassword } from "@/lib/auth/password";
import { DEFAULT_SCHOOL } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import type { AppLocale } from "@/lib/i18n/app-locale";

/** Stable system account for the default Chats assistant thread. */
export const ASSISTANT_BOT_USERNAME = "sideseat_assistant";

async function resolveWelcomeLocale(explicit?: AppLocale): Promise<AppLocale> {
  if (explicit) return explicit;
  try {
    const { getServerAppLocale } = await import("@/lib/i18n/server-locale");
    return await getServerAppLocale();
  } catch {
    // Chinese-first when locale cookie/header is unavailable (scripts, some API paths).
    return "zh-CN";
  }
}

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

async function ensureWelcomeOnConnection(
  connectionId: string,
  botUserId: string,
  viewerUserId: string,
  localeHint?: AppLocale,
) {
  const hasMessage = await prisma.message.findFirst({
    where: { connectionId },
    select: { id: true },
  });
  if (hasMessage) return;

  const [locale, viewer] = await Promise.all([
    resolveWelcomeLocale(localeHint),
    prisma.user.findUnique({
      where: { id: viewerUserId },
      select: {
        isGuest: true,
        verifiedStudent: true,
      },
    }),
  ]);

  const payload = buildAssistantWelcomePayload(locale, {
    isGuest: viewer?.isGuest ?? true,
    verifiedStudent: viewer?.verifiedStudent ?? false,
  });

  await prisma.message.create({
    data: {
      connectionId,
      senderId: botUserId,
      body: serializeAssistantMessage(payload),
    },
  });
}

/** Ensures a single ACTIVE DM with the assistant bot and a welcome message on first open. */
export async function ensureAssistantBotConnection(
  viewerUserId: string,
  options?: { locale?: AppLocale },
): Promise<string> {
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

  await ensureWelcomeOnConnection(primary.id, bot.id, viewerUserId, options?.locale);
  return primary.id;
}

export function isAssistantBotUser(user: { username: string }): boolean {
  return user.username === ASSISTANT_BOT_USERNAME;
}
