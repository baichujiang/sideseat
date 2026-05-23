import { NextRequest } from "next/server";
import { ConnectionStatus, type Prisma, type UserGender } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { nicknameToKey } from "@/lib/auth/nickname-key";
import { prisma } from "@/lib/db/prisma";
import { ok } from "@/lib/http";

export type ContactSearchHit = {
  id: string;
  username: string;
  nickname: string | null;
  email: string | null;
  gender: UserGender;
  avatarUrl: string | null;
  major: string | null;
  school: string | null;
  activeConnectionId: string | null;
};

export async function GET(request: NextRequest) {
  const user = await requireOnboardedUser();
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";

  if (query.length < 2) {
    return ok({ hits: [] as ContactSearchHit[] });
  }

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
      id: { not: user.id },
      isGuest: false,
      onboardingComplete: true,
      blocksInitiated: { none: { blockedId: user.id } },
      blocksReceived: { none: { blockerId: user.id } },
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

  if (matches.length === 0) {
    return ok({ hits: [] as ContactSearchHit[] });
  }

  const peerIds = matches.map((match) => match.id);
  const connections = await prisma.connection.findMany({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [
        { userAId: user.id, userBId: { in: peerIds } },
        { userAId: { in: peerIds }, userBId: user.id },
      ],
    },
    select: { id: true, userAId: true, userBId: true },
  });

  const activeConnectionIdByPeerId = new Map<string, string>();
  for (const connection of connections) {
    const peerId = connection.userAId === user.id ? connection.userBId : connection.userAId;
    activeConnectionIdByPeerId.set(peerId, connection.id);
  }

  const hits: ContactSearchHit[] = matches
    .map((match) => ({
      ...match,
      activeConnectionId: activeConnectionIdByPeerId.get(match.id) ?? null,
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
    });

  return ok({ hits });
}
