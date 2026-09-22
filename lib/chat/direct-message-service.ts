import "server-only";

import {
  type ActionInterestSurface,
  type ClassmatePostCategory,
  MessageType,
  Prisma,
  type ProductFunnelSourceKind,
} from "@prisma/client";

import { RETIRED_SYSTEM_USERNAMES } from "@/lib/auth/retired-system-users";
import { UNREPLIED_DIRECT_MESSAGE_LIMIT } from "@/lib/chat/unreplied-direct-message-limit";
import { isAllowedChatImageUrl } from "@/lib/constants/chat-media";
import { parseActionOriginSnapshot } from "@/lib/v2/action-context-snapshot";
import { ACTION_COORDINATION_POLICY_SCHEMA_VERSION } from "@/lib/v2/action-coordination/capability";
import { actionPolicyTupleKind } from "@/lib/v2/action-coordination/policy-snapshot";
import {
  businessFunnelEventKeys,
  recordServerFunnelEvent,
} from "@/lib/v2/funnel-events";
import type { DirectMessageInput } from "@/lib/validators/invitation";

type DirectMessageDb = Pick<
  Prisma.TransactionClient,
  "message" | "connection" | "$executeRaw"
>;

type DirectReplyGateDecision = {
  unlockAfterSend: boolean;
};

export class InvalidDirectMessageImageError extends Error {}

export class DirectMessageActionContextUnavailableError extends Error {
  constructor(message = "The focused Action coordination is unavailable.") {
    super(message);
    this.name = "DirectMessageActionContextUnavailableError";
  }
}

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
        type: { notIn: [MessageType.SYSTEM, MessageType.ACTION_INTEREST_CARD, MessageType.MUTUAL_OPPORTUNITY_CARD] },
      },
    }),
    db.message.findFirst({
      where: {
        connectionId: options.connectionId,
        senderId: peerId,
        type: { notIn: [MessageType.SYSTEM, MessageType.ACTION_INTEREST_CARD, MessageType.MUTUAL_OPPORTUNITY_CARD] },
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
    createdAt?: Date;
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
        actionContextId: options.input.actionContextId,
        createdAt: options.createdAt,
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
        actionContextId: options.input.actionContextId,
        createdAt: options.createdAt,
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
      actionContextId: options.input.actionContextId,
      createdAt: options.createdAt,
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

const focusedContextSelect = Prisma.validator<Prisma.ActionCoordinationContextSelect>()({
  id: true,
  state: true,
  connectionId: true,
  firstCounterpartResponseAt: true,
  currentActivationId: true,
  currentActivation: {
    select: {
      id: true,
      interestId: true,
      interestSurface: true,
      connectedAt: true,
      firstContentType: true,
      terminalReason: true,
    },
  },
  interest: {
    select: {
      id: true,
      userId: true,
      status: true,
      originSnapshot: true,
      classmatePostId: true,
      classmatePost: {
        select: {
          id: true,
          userId: true,
          category: true,
          coordinationPolicy: true,
          policySchemaVersion: true,
          policyParametersSnapshot: true,
          experimentKeySnapshot: true,
          experimentVariantSnapshot: true,
          clientCapabilitySnapshot: true,
          policySnapshottedAt: true,
        },
      },
    },
  },
});

export type FocusedDirectMessageActionContext =
  Prisma.ActionCoordinationContextGetPayload<{
    select: typeof focusedContextSelect;
  }>;

/**
 * Pair safety must already be held. Lock and validate the explicit Context
 * before the direct-message writer locks the Connection. Omitted Context IDs
 * never call this path and are deliberately left unattributed.
 */
export async function lockFocusedDirectMessageActionContext(
  tx: Prisma.TransactionClient,
  options: {
    actionContextId: string;
    connectionId: string;
    actorId: string;
    participantIds: readonly [string, string];
  },
): Promise<FocusedDirectMessageActionContext> {
  const locked = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ActionCoordinationContext"
    WHERE "id" = ${options.actionContextId}
    FOR UPDATE
  `);
  if (!locked[0]) throw new DirectMessageActionContextUnavailableError();
  const context = await tx.actionCoordinationContext.findUnique({
    where: { id: options.actionContextId },
    select: focusedContextSelect,
  });
  if (!context) throw new DirectMessageActionContextUnavailableError();
  const interest = context.interest;
  const action = interest.classmatePost;
  const expected = new Set([interest.userId, action.userId]);
  const actual = new Set(options.participantIds);
  const activation = context.currentActivation;
  const origin = parseActionOriginSnapshot(interest.originSnapshot);
  if (
    context.state !== "OPEN" ||
    context.connectionId !== options.connectionId ||
    interest.status !== "ACTIVE" ||
    !actual.has(options.actorId) ||
    expected.size !== 2 ||
    actual.size !== 2 ||
    [...expected].some((id) => !actual.has(id)) ||
    !activation ||
    context.currentActivationId !== activation.id ||
    activation.interestId !== interest.id ||
    activation.connectedAt === null ||
    activation.firstContentType === null ||
    activation.terminalReason !== null ||
    actionPolicyTupleKind(action) !== "SNAPSHOTTED_CREATOR_GATED" ||
    origin?.kind !== "LIVE"
  ) {
    throw new DirectMessageActionContextUnavailableError();
  }
  return context;
}

function sourceKind(category: ClassmatePostCategory): ProductFunnelSourceKind {
  return category === "SHARED_COURSES" ? "COURSE_ACTION" : "BUDDY_POST";
}

/** The interested counterpart owns the once-only human-response transition. */
export async function recordFirstFocusedCounterpartResponse(
  tx: Prisma.TransactionClient,
  options: {
    context: FocusedDirectMessageActionContext;
    actorId: string;
    connectionId: string;
    occurredAt: Date;
  },
): Promise<boolean> {
  const context = options.context;
  const interest = context.interest;
  const action = interest.classmatePost;
  const activation = context.currentActivation;
  if (options.actorId !== interest.userId || !activation) return false;
  const updated = await tx.actionCoordinationContext.updateMany({
    where: {
      id: context.id,
      connectionId: options.connectionId,
      state: "OPEN",
      firstCounterpartResponseAt: null,
    },
    data: {
      firstCounterpartResponseAt: options.occurredAt,
      updatedAt: options.occurredAt,
    },
  });
  if (updated.count !== 1) return false;
  await recordServerFunnelEvent(tx, {
    businessEventKey: businessFunnelEventKeys.firstHumanResponse(context.id),
    actorId: options.actorId,
    name: "FIRST_HUMAN_RESPONSE",
    surface: "CHAT",
    sourceKind: sourceKind(action.category),
    sourceId: action.id,
    connectionId: options.connectionId,
    actionInterestId: interest.id,
    interestActivationId: activation.id,
    actionContextId: context.id,
    interestSurface: activation.interestSurface as ActionInterestSurface,
    coordinationPolicy: "CREATOR_GATED_V2",
    policySchemaVersion: ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
    experimentKey: action.experimentKeySnapshot!,
    experimentVariant: action.experimentVariantSnapshot!,
    occurredAt: options.occurredAt,
  });
  return true;
}
