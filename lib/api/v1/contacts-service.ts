import "server-only";

import {
  ConnectionStatus,
  FriendLinkStatus,
  type Prisma,
  type UserGender,
} from "@prisma/client";

import { nicknameToKey } from "@/lib/auth/nickname-key";
import {
  type ConnectionDatabase,
  withCanonicalConnectionScope,
  withConnectionTransaction,
} from "@/lib/connections/canonical-connection";
import { contactRemarkForViewer } from "@/lib/connections/contact-remark";
import { prisma } from "@/lib/db/prisma";

export type NativeContactRow = {
  connectionId: string;
  peer: {
    id: string;
    username: string;
    nickname: string | null;
    avatarUrl: string | null;
  };
  remark: string | null;
  courseName: string | null;
  updatedAt: string;
};

export type NativeContactSearchHit = {
  id: string;
  username: string;
  nickname: string | null;
  gender: UserGender;
  avatarUrl: string | null;
  major: string | null;
  school: string | null;
  activeConnectionId: string | null;
};

export class ContactsServiceError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "CONTENT_RESTRICTED"
      | "INVALID_REQUEST"
      | "CONFLICT",
  ) {
    super(code);
    this.name = "ContactsServiceError";
  }
}

export async function listAcceptedContacts(userId: string): Promise<NativeContactRow[]> {
  const links = await prisma.friendLink.findMany({
    where: {
      status: FriendLinkStatus.ACCEPTED,
      connection: {
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }],
      },
    },
    include: {
      connection: {
        include: {
          userA: {
            select: { id: true, username: true, nickname: true, avatarUrl: true },
          },
          userB: {
            select: { id: true, username: true, nickname: true, avatarUrl: true },
          },
          invitation: { include: { course: { select: { name: true } } } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
  });

  return links.map((link) => {
    const connection = link.connection;
    const peer =
      connection.userAId === userId ? connection.userB : connection.userA;
    return {
      connectionId: connection.id,
      peer: {
        id: peer.id,
        username: peer.username,
        nickname: peer.nickname,
        avatarUrl: peer.avatarUrl,
      },
      remark: contactRemarkForViewer(connection, userId),
      courseName: connection.invitation?.course?.name ?? null,
      updatedAt: link.updatedAt.toISOString(),
    };
  });
}

export async function searchContacts(options: {
  userId: string;
  query: string;
}): Promise<NativeContactSearchHit[]> {
  const query = options.query.trim();
  if (query.length < 2) return [];

  const lower = query.toLowerCase();
  const nicknameQueryKey = nicknameToKey(query);
  const matchOr: Prisma.UserWhereInput[] = [
    { id: { equals: query } },
    { username: { contains: query, mode: "insensitive" } },
    { nickname: { contains: query, mode: "insensitive" } },
    { email: { contains: query, mode: "insensitive" } },
  ];
  if (nicknameQueryKey.length >= 2) {
    matchOr.unshift({ nicknameKey: nicknameQueryKey });
  }

  const matches = await prisma.user.findMany({
    where: {
      id: { not: options.userId },
      isGuest: false,
      onboardingComplete: true,
      blocksInitiated: { none: { blockedId: options.userId } },
      blocksReceived: { none: { blockerId: options.userId } },
      moderationBlocks: { none: { isActive: true } },
      OR: matchOr,
    },
    select: {
      id: true,
      username: true,
      nickname: true,
      email: true,
      gender: true,
      avatarUrl: true,
      major: true,
      school: true,
    },
    take: 20,
  });
  if (matches.length === 0) return [];

  const peerIds = matches.map((match) => match.id);
  const connections = await prisma.connection.findMany({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [
        { userAId: options.userId, userBId: { in: peerIds } },
        { userAId: { in: peerIds }, userBId: options.userId },
      ],
    },
    select: { id: true, userAId: true, userBId: true },
  });
  const activeConnectionIdByPeerId = new Map<string, string>();
  for (const connection of connections) {
    const peerId =
      connection.userAId === options.userId ? connection.userBId : connection.userAId;
    activeConnectionIdByPeerId.set(peerId, connection.id);
  }

  return matches
    .map((match) => ({
      id: match.id,
      username: match.username,
      nickname: match.nickname,
      gender: match.gender,
      avatarUrl: match.avatarUrl,
      major: match.major,
      school: match.school,
      activeConnectionId: activeConnectionIdByPeerId.get(match.id) ?? null,
      email: match.email,
    }))
    .sort((a, b) => {
      const aIdExact = a.id === query ? 1 : 0;
      const bIdExact = b.id === query ? 1 : 0;
      if (aIdExact !== bIdExact) return bIdExact - aIdExact;
      const aEmailExact = (a.email ?? "").toLowerCase() === lower ? 1 : 0;
      const bEmailExact = (b.email ?? "").toLowerCase() === lower ? 1 : 0;
      if (aEmailExact !== bEmailExact) return bEmailExact - aEmailExact;
      const aNickExact =
        nicknameQueryKey.length >= 2 &&
        (a.nickname ? nicknameToKey(a.nickname) === nicknameQueryKey : false)
          ? 1
          : 0;
      const bNickExact =
        nicknameQueryKey.length >= 2 &&
        (b.nickname ? nicknameToKey(b.nickname) === nicknameQueryKey : false)
          ? 1
          : 0;
      if (aNickExact !== bNickExact) return bNickExact - aNickExact;
      const aHandleStarts = a.username.toLowerCase().startsWith(lower) ? 1 : 0;
      const bHandleStarts = b.username.toLowerCase().startsWith(lower) ? 1 : 0;
      if (aHandleStarts !== bHandleStarts) return bHandleStarts - aHandleStarts;
      const aAlreadyAdded = a.activeConnectionId ? 1 : 0;
      const bAlreadyAdded = b.activeConnectionId ? 1 : 0;
      if (aAlreadyAdded !== bAlreadyAdded) return bAlreadyAdded - aAlreadyAdded;
      return (a.nickname ?? a.username).localeCompare(b.nickname ?? b.username);
    })
    .map((candidate) => {
      const { email, ...hit } = candidate;
      void email;
      return hit;
    });
}

export async function addContact(options: {
  userId: string;
  peerId: string;
  db?: ConnectionDatabase;
}): Promise<{ connectionId: string; created: boolean }> {
  if (options.peerId === options.userId) {
    throw new ContactsServiceError("INVALID_REQUEST");
  }

  return withConnectionTransaction(options.db ?? prisma, (tx) =>
    withCanonicalConnectionScope(
      tx,
      options.userId,
      options.peerId,
      async (scope) => {
        const [actor, peer, mutualBlock, moderated] = await Promise.all([
          tx.user.findUnique({
            where: { id: options.userId },
            select: { id: true, isGuest: true, onboardingComplete: true },
          }),
          tx.user.findUnique({
            where: { id: options.peerId },
            select: { id: true, isGuest: true, onboardingComplete: true },
          }),
          tx.block.findFirst({
            where: {
              OR: [
                { blockerId: options.userId, blockedId: options.peerId },
                { blockerId: options.peerId, blockedId: options.userId },
              ],
            },
            select: { id: true },
          }),
          tx.moderationBlock.findFirst({
            where: {
              userId: { in: [options.userId, options.peerId] },
              isActive: true,
            },
            select: { id: true },
          }),
        ]);

        if (
          !actor ||
          actor.isGuest ||
          !actor.onboardingComplete ||
          !peer ||
          peer.isGuest ||
          !peer.onboardingComplete
        ) {
          throw new ContactsServiceError("NOT_FOUND");
        }
        if (mutualBlock || moderated) {
          throw new ContactsServiceError("CONTENT_RESTRICTED");
        }
        if (scope.existing?.status === ConnectionStatus.ACTIVE) {
          return { connectionId: scope.existing.id, created: false };
        }
        if (scope.existing) {
          throw new ContactsServiceError("CONFLICT");
        }

        const connection = await scope.createActive();
        return { connectionId: connection.id, created: connection.created };
      },
    ),
  );
}
