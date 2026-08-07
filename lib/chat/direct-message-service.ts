import "server-only";

import { MessageType, Prisma } from "@prisma/client";

import { RETIRED_SYSTEM_USERNAMES } from "@/lib/auth/retired-system-users";
import { UNREPLIED_DIRECT_MESSAGE_LIMIT } from "@/lib/chat/unreplied-direct-message-limit";
import { isAllowedChatImageUrl } from "@/lib/constants/chat-media";
import type { DirectMessageInput } from "@/lib/validators/invitation";

type DirectMessageDb = Pick<
  Prisma.TransactionClient,
  "message" | "connection" | "$executeRaw"
>;

type DirectReplyGateDecision = {
  unlockAfterSend: boolean;
};

export class InvalidDirectMessageImageError extends Error {}

export class PeerReplyRequiredError extends Error {
  constructor(message = "Wait for a reply before sending more messages.") {
    super(message);
    this.name = "PeerReplyRequiredError";
  }
}

export function activeDirectConnectionWhere(
  connectionId: string,
  userId: string,
): Prisma.ConnectionWhereInput {
  return {
    id: connectionId,
    status: "ACTIVE",
    userA: {
      username: { notIn: [...RETIRED_SYSTEM_USERNAMES] },
      moderationBlocks: { none: { isActive: true } },
    },
    userB: {
      username: { notIn: [...RETIRED_SYSTEM_USERNAMES] },
      moderationBlocks: { none: { isActive: true } },
    },
    OR: [{ userAId: userId }, { userBId: userId }],
  };
}

async function resolveReplyToId(
  db: Pick<Prisma.TransactionClient, "message">,
  connectionId: string,
  requestedId: string | undefined,
) {
  if (!requestedId) return null;
  const target = await db.message.findFirst({
    where: { id: requestedId, connectionId, deletedAt: null },
    select: { id: true },
  });
  return target?.id ?? null;
}

/** The first peer reply permanently unlocks normal messaging for both people. */
export async function assertDirectUnrepliedSendAllowed(
  db: DirectMessageDb,
  options: {
    connectionId: string;
    senderId: string;
    max?: number;
  },
): Promise<DirectReplyGateDecision> {
  const max = options.max ?? UNREPLIED_DIRECT_MESSAGE_LIMIT;
  // Serialize every outbound item in a direct thread so concurrent text and
  // plan-card requests cannot both slip past the two-message first-contact gate.
  await db.$executeRaw`SELECT id FROM "Connection" WHERE id = ${options.connectionId} FOR UPDATE`;
  const connection = await db.connection.findUnique({
    where: { id: options.connectionId },
    select: {
      userAId: true,
      userBId: true,
      replyLimitUnlockedAt: true,
    },
  });
  if (!connection) return { unlockAfterSend: false };
  if (connection.userAId === connection.userBId) return { unlockAfterSend: false };

  const peerId =
    connection.userBId === options.senderId ? connection.userAId : connection.userBId;
  if (connection.replyLimitUnlockedAt) {
    return { unlockAfterSend: false };
  }

  const [senderMessageCount, peerMessage] = await Promise.all([
    db.message.count({
      where: {
        connectionId: options.connectionId,
        senderId: options.senderId,
        type: { not: MessageType.SYSTEM },
      },
    }),
    db.message.findFirst({
      where: {
        connectionId: options.connectionId,
        senderId: peerId,
        type: { not: MessageType.SYSTEM },
      },
      select: { id: true },
    }),
  ]);

  // Existing mutual conversations self-heal even if a deployment missed backfill.
  if (senderMessageCount > 0 && peerMessage) {
    await db.connection.update({
      where: { id: options.connectionId },
      data: { replyLimitUnlockedAt: new Date() },
    });
    return { unlockAfterSend: false };
  }

  if (senderMessageCount >= max) {
    throw new PeerReplyRequiredError();
  }
  return { unlockAfterSend: Boolean(peerMessage) };
}

export async function createDirectMessageRecord(
  db: DirectMessageDb,
  options: {
    connectionId: string;
    senderId: string;
    input: DirectMessageInput;
  },
) {
  const gate = await assertDirectUnrepliedSendAllowed(db, {
    connectionId: options.connectionId,
    senderId: options.senderId,
  });

  const replyToId = await resolveReplyToId(db, options.connectionId, options.input.replyToId);

  if (options.input.type === "TEXT") {
    const body = options.input.body.trim();
    const message = await db.message.create({
      data: {
        connectionId: options.connectionId,
        senderId: options.senderId,
        body,
        type: MessageType.TEXT,
        replyToId,
      },
    });
    await completeDirectReplyGateAfterSend(db, options.connectionId, message.createdAt, gate);
    return { message, bodyPreview: body };
  }

  if (options.input.type === "IMAGE") {
    if (!isAllowedChatImageUrl(options.connectionId, options.input.imageUrl)) {
      throw new InvalidDirectMessageImageError("Invalid image URL.");
    }
    const caption = (options.input.body ?? "").trim();
    const message = await db.message.create({
      data: {
        connectionId: options.connectionId,
        senderId: options.senderId,
        body: caption,
        type: MessageType.IMAGE,
        imageUrl: options.input.imageUrl,
        replyToId,
      },
    });
    await completeDirectReplyGateAfterSend(db, options.connectionId, message.createdAt, gate);
    return { message, bodyPreview: caption || "Photo" };
  }

  const caption = (options.input.body ?? "").trim();
  const locationName = options.input.locationName?.trim() || null;
  const message = await db.message.create({
    data: {
      connectionId: options.connectionId,
      senderId: options.senderId,
      body: caption,
      type: MessageType.LOCATION,
      locationLat: options.input.locationLat,
      locationLng: options.input.locationLng,
      locationName,
      replyToId,
    },
  });
  await completeDirectReplyGateAfterSend(db, options.connectionId, message.createdAt, gate);
  return { message, bodyPreview: caption || locationName || "Location" };
}

export async function completeDirectReplyGateAfterSend(
  db: DirectMessageDb,
  connectionId: string,
  createdAt: Date,
  gate: DirectReplyGateDecision,
) {
  if (!gate.unlockAfterSend) return;
  await db.connection.update({
    where: { id: connectionId },
    data: { replyLimitUnlockedAt: createdAt },
  });
}
