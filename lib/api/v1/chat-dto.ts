import type { Prisma } from "@prisma/client";

import { planRequestV1, planRequestV1Include } from "@/lib/api/v1/plans-dto";
import { parseActionOriginSnapshot } from "@/lib/v2/action-context-snapshot";

export const directMessageV1Include = {
  sender: {
    select: { id: true, username: true, nickname: true, avatarUrl: true },
  },
  replyTo: {
    include: {
      sender: {
        select: { id: true, username: true, nickname: true, avatarUrl: true },
      },
    },
  },
  planRequest: {
    include: planRequestV1Include,
  },
  actionInterest: {
    select: {
      id: true,
      status: true,
      classmatePostId: true,
      connectionId: true,
      originSnapshot: true,
      createdAt: true,
      updatedAt: true,
    },
  },
  mutualOpportunity: {
    select: {
      id: true,
      policyVersion: true,
      topic: true,
      contextSnapshot: true,
    },
  },
} satisfies Prisma.MessageInclude;

type DirectMessageV1Row = Prisma.MessageGetPayload<{
  include: typeof directMessageV1Include;
}>;

function messageAuthor(user: DirectMessageV1Row["sender"]) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  };
}

export function directMessageV1(message: DirectMessageV1Row) {
  const deleted = message.deletedAt !== null;
  const actionOrigin = message.actionInterest
    ? parseActionOriginSnapshot(message.actionInterest.originSnapshot)
    : null;
  return {
    id: message.id,
    connectionId: message.connectionId,
    sender: messageAuthor(message.sender),
    type: message.type,
    body: deleted ? null : message.body,
    imageUrl: deleted ? null : message.imageUrl,
    location:
      !deleted && message.locationLat !== null && message.locationLng !== null
        ? {
            latitude: message.locationLat,
            longitude: message.locationLng,
            name: message.locationName,
          }
        : null,
    availabilityShareId: message.availabilityShareId,
    planRequestId: message.planRequestId,
    planRequest: message.planRequest ? planRequestV1(message.planRequest) : null,
    actionInterestId: message.actionInterestId,
    actionContextId: message.actionContextId,
    actionInterest: message.actionInterest && actionOrigin?.kind === "LIVE"
      ? {
          id: message.actionInterest.id,
          status: message.actionInterest.status,
          // A source card can only exist after Connect. Keep the legacy wire
          // contract non-null even though creator-gated waiting Interests have
          // no Connection at the database layer.
          connectionId:
            message.actionInterest.connectionId ?? message.connectionId,
          postId: message.actionInterest.classmatePostId,
          context: actionOrigin.snapshot,
          createdAt: message.actionInterest.createdAt.toISOString(),
          updatedAt: message.actionInterest.updatedAt.toISOString(),
        }
      : null,
    mutualOpportunity: message.mutualOpportunity
      ? {
          id: message.mutualOpportunity.id,
          policyVersion: message.mutualOpportunity.policyVersion,
          topic: message.mutualOpportunity.topic,
          context: message.mutualOpportunity.contextSnapshot,
        }
      : null,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          sender: messageAuthor(message.replyTo.sender),
          type: message.replyTo.type,
          body: message.replyTo.deletedAt ? null : message.replyTo.body,
          deletedAt: message.replyTo.deletedAt?.toISOString() ?? null,
        }
      : null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}
