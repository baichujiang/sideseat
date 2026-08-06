import type { Prisma } from "@prisma/client";

import { planRequestV1, planRequestV1Include } from "@/lib/api/v1/plans-dto";

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
