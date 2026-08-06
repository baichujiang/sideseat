import "server-only";

import {
  ConnectionStatus,
  ContactExchangeStatus,
  FriendLinkStatus,
} from "@prisma/client";

import { CONTACT_EXCHANGE_DECLINE_COOLDOWN_HOURS } from "@/lib/constants/app";
import { contactRemarkForViewer } from "@/lib/connections/contact-remark";
import { prisma } from "@/lib/db/prisma";

export type LinkRole = "none" | "requester" | "responder";
export type FriendLinkActionState = {
  status: "NONE" | "PENDING" | "ACCEPTED" | "DECLINED";
  role: LinkRole;
};
export type ContactExchangeActionState = {
  status: "NONE" | "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELED";
  role: LinkRole;
  cooldownUntil: string | null;
};

export class ConnectionActionsError extends Error {
  constructor(
    readonly code: "NOT_FOUND" | "INVALID_REQUEST" | "CONTENT_RESTRICTED",
    readonly messageText: string,
  ) {
    super(messageText);
    this.name = "ConnectionActionsError";
  }
}

async function requireActiveConnection(userId: string, connectionId: string) {
  const connection = await prisma.connection.findFirst({
    where: {
      id: connectionId,
      status: ConnectionStatus.ACTIVE,
      OR: [{ userAId: userId }, { userBId: userId }],
    },
  });
  if (!connection) {
    throw new ConnectionActionsError("NOT_FOUND", "Conversation not found.");
  }
  return connection;
}

export async function loadConnectionActions(options: {
  userId: string;
  connectionId: string;
}) {
  const connection = await prisma.connection.findFirst({
    where: {
      id: options.connectionId,
      OR: [{ userAId: options.userId }, { userBId: options.userId }],
    },
    include: {
      friendLink: true,
      contactExchangeRequests: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!connection) {
    throw new ConnectionActionsError("NOT_FOUND", "Conversation not found.");
  }

  const peerId =
    connection.userAId === options.userId ? connection.userBId : connection.userAId;
  const isSelfNotes = connection.userAId === connection.userBId;

  let friendLink: FriendLinkActionState = { status: "NONE", role: "none" };
  if (connection.friendLink) {
    const link = connection.friendLink;
    friendLink = {
      status: link.status,
      role:
        link.requesterId === options.userId
          ? "requester"
          : link.responderId === options.userId
            ? "responder"
            : "none",
    };
  }

  let contactExchange: ContactExchangeActionState = {
    status: "NONE",
    role: "none",
    cooldownUntil: null,
  };
  const latest = connection.contactExchangeRequests[0];
  if (latest) {
    const cooldownMs = CONTACT_EXCHANGE_DECLINE_COOLDOWN_HOURS * 60 * 60 * 1000;
    const cooldownUntil =
      (latest.status === ContactExchangeStatus.DECLINED ||
        latest.status === ContactExchangeStatus.CANCELED) &&
      latest.updatedAt.getTime() + cooldownMs > Date.now()
        ? new Date(latest.updatedAt.getTime() + cooldownMs).toISOString()
        : null;
    contactExchange = {
      status: latest.status,
      role:
        latest.requesterId === options.userId
          ? "requester"
          : latest.responderId === options.userId
            ? "responder"
            : "none",
      cooldownUntil,
    };
  }

  return {
    remark: contactRemarkForViewer(connection, options.userId),
    peerId,
    isSelfNotes,
    friendLink,
    contactExchange,
  };
}

export async function endConnection(options: {
  userId: string;
  connectionId: string;
}): Promise<{ endedAt: string }> {
  const endedAt = new Date();
  const result = await prisma.connection.updateMany({
    where: {
      id: options.connectionId,
      OR: [{ userAId: options.userId }, { userBId: options.userId }],
    },
    data: {
      status: ConnectionStatus.ENDED,
      endedById: options.userId,
      endedAt,
    },
  });
  if (result.count === 0) {
    throw new ConnectionActionsError("NOT_FOUND", "Conversation not found.");
  }
  return { endedAt: endedAt.toISOString() };
}

export async function blockConnectionPeer(options: {
  userId: string;
  connectionId: string;
  blockedId?: string;
  reason?: string | null;
}): Promise<{ blocked: true }> {
  const connection = await requireActiveConnection(
    options.userId,
    options.connectionId,
  );
  const peerId =
    connection.userAId === options.userId ? connection.userBId : connection.userAId;
  const blockedId = options.blockedId ?? peerId;
  if (blockedId !== peerId) {
    throw new ConnectionActionsError(
      "INVALID_REQUEST",
      "The blocked user must match this conversation.",
    );
  }
  if (blockedId === options.userId) {
    throw new ConnectionActionsError("INVALID_REQUEST", "You cannot block yourself.");
  }

  const endedAt = new Date();
  await prisma.$transaction([
    prisma.block.upsert({
      where: {
        blockerId_blockedId: {
          blockerId: options.userId,
          blockedId,
        },
      },
      create: {
        blockerId: options.userId,
        blockedId,
        reason: options.reason?.trim() || null,
      },
      update: {
        reason: options.reason?.trim() || null,
      },
    }),
    prisma.connection.update({
      where: { id: connection.id },
      data: {
        status: ConnectionStatus.BLOCKED,
        endedById: options.userId,
        endedAt,
      },
    }),
  ]);
  return { blocked: true };
}

export async function patchContactRemark(options: {
  userId: string;
  connectionId: string;
  remark: string | null;
}): Promise<{ remark: string | null }> {
  const connection = await prisma.connection.findFirst({
    where: {
      id: options.connectionId,
      OR: [{ userAId: options.userId }, { userBId: options.userId }],
    },
    select: { id: true, userAId: true, userBId: true },
  });
  if (!connection) {
    throw new ConnectionActionsError("NOT_FOUND", "Conversation not found.");
  }
  const isUserA = connection.userAId === options.userId;
  const updated = await prisma.connection.update({
    where: { id: connection.id },
    data: isUserA
      ? { contactRemarkByA: options.remark }
      : { contactRemarkByB: options.remark },
    select: { contactRemarkByA: true, contactRemarkByB: true },
  });
  return {
    remark: isUserA ? updated.contactRemarkByA : updated.contactRemarkByB,
  };
}

export async function mutateFriendLink(options: {
  userId: string;
  connectionId: string;
  action: "request" | "accept" | "decline" | "cancel";
}): Promise<FriendLinkActionState> {
  const connection = await requireActiveConnection(
    options.userId,
    options.connectionId,
  );
  const otherUserId =
    connection.userAId === options.userId ? connection.userBId : connection.userAId;
  const friendLink = await prisma.friendLink.findUnique({
    where: { connectionId: options.connectionId },
  });

  if (options.action === "request") {
    if (friendLink?.status === FriendLinkStatus.ACCEPTED) {
      return { status: "ACCEPTED", role: "none" };
    }
    if (
      friendLink?.status === FriendLinkStatus.PENDING &&
      friendLink.requesterId !== options.userId
    ) {
      throw new ConnectionActionsError(
        "INVALID_REQUEST",
        "A friend request is already pending.",
      );
    }
    const updated = await prisma.friendLink.upsert({
      where: { connectionId: options.connectionId },
      create: {
        connectionId: options.connectionId,
        requesterId: options.userId,
        responderId: otherUserId,
        status: FriendLinkStatus.PENDING,
      },
      update: {
        requesterId: options.userId,
        responderId: otherUserId,
        status: FriendLinkStatus.PENDING,
      },
    });
    return { status: updated.status, role: "requester" };
  }

  if (!friendLink || friendLink.status !== FriendLinkStatus.PENDING) {
    throw new ConnectionActionsError(
      "INVALID_REQUEST",
      "There is no pending friend request.",
    );
  }

  if (options.action === "accept" || options.action === "decline") {
    if (friendLink.responderId !== options.userId) {
      throw new ConnectionActionsError(
        "INVALID_REQUEST",
        "Only the recipient can respond to this request.",
      );
    }
    const updated = await prisma.friendLink.update({
      where: { connectionId: options.connectionId },
      data: {
        status:
          options.action === "accept"
            ? FriendLinkStatus.ACCEPTED
            : FriendLinkStatus.DECLINED,
      },
    });
    return {
      status: updated.status,
      role: "responder",
    };
  }

  if (friendLink.requesterId !== options.userId) {
    throw new ConnectionActionsError(
      "INVALID_REQUEST",
      "Only the requester can cancel this request.",
    );
  }
  const updated = await prisma.friendLink.update({
    where: { connectionId: options.connectionId },
    data: { status: FriendLinkStatus.DECLINED },
  });
  return { status: updated.status, role: "requester" };
}

export async function mutateContactExchange(options: {
  userId: string;
  connectionId: string;
  action: "request" | "accept" | "decline" | "cancel";
}): Promise<ContactExchangeActionState> {
  const connection = await prisma.connection.findFirst({
    where: {
      id: options.connectionId,
      status: ConnectionStatus.ACTIVE,
      OR: [{ userAId: options.userId }, { userBId: options.userId }],
    },
    include: {
      contactExchangeRequests: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!connection) {
    throw new ConnectionActionsError("NOT_FOUND", "Conversation not found.");
  }
  const otherUserId =
    connection.userAId === options.userId ? connection.userBId : connection.userAId;
  const latest = connection.contactExchangeRequests[0];

  if (options.action === "request") {
    const alreadyAccepted = connection.contactExchangeRequests.some(
      (row) => row.status === ContactExchangeStatus.ACCEPTED,
    );
    const alreadyPending = connection.contactExchangeRequests.some(
      (row) => row.status === ContactExchangeStatus.PENDING,
    );
    if (alreadyAccepted) {
      return { status: "ACCEPTED", role: "none", cooldownUntil: null };
    }
    if (alreadyPending) {
      throw new ConnectionActionsError(
        "INVALID_REQUEST",
        "A contact exchange request is already pending.",
      );
    }
    const cooldownMs = CONTACT_EXCHANGE_DECLINE_COOLDOWN_HOURS * 60 * 60 * 1000;
    if (
      latest &&
      (latest.status === ContactExchangeStatus.DECLINED ||
        latest.status === ContactExchangeStatus.CANCELED) &&
      latest.updatedAt.getTime() + cooldownMs > Date.now()
    ) {
      throw new ConnectionActionsError(
        "INVALID_REQUEST",
        "Contact exchange is temporarily unavailable after a recent decline.",
      );
    }
    const created = await prisma.contactExchangeRequest.create({
      data: {
        connectionId: options.connectionId,
        requesterId: options.userId,
        responderId: otherUserId,
        status: ContactExchangeStatus.PENDING,
      },
    });
    return { status: created.status, role: "requester", cooldownUntil: null };
  }

  if (!latest || latest.status !== ContactExchangeStatus.PENDING) {
    throw new ConnectionActionsError(
      "INVALID_REQUEST",
      "There is no pending contact exchange request.",
    );
  }

  if (options.action === "accept" || options.action === "decline") {
    if (latest.responderId !== options.userId) {
      throw new ConnectionActionsError(
        "INVALID_REQUEST",
        "Only the recipient can respond to this request.",
      );
    }
    await prisma.contactExchangeRequest.updateMany({
      where: {
        connectionId: options.connectionId,
        responderId: options.userId,
        status: ContactExchangeStatus.PENDING,
      },
      data: {
        status:
          options.action === "accept"
            ? ContactExchangeStatus.ACCEPTED
            : ContactExchangeStatus.DECLINED,
      },
    });
    return loadConnectionActions(options).then((state) => state.contactExchange);
  }

  if (latest.requesterId !== options.userId) {
    throw new ConnectionActionsError(
      "INVALID_REQUEST",
      "Only the requester can cancel this request.",
    );
  }
  await prisma.contactExchangeRequest.updateMany({
    where: {
      connectionId: options.connectionId,
      requesterId: options.userId,
      status: ContactExchangeStatus.PENDING,
    },
    data: { status: ContactExchangeStatus.CANCELED },
  });
  return loadConnectionActions(options).then((state) => state.contactExchange);
}
