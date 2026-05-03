import { ConnectionStatus, FriendLinkStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { safeReturnPath } from "@/lib/nav/back";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const user = await requireOnboardedUser();
  const { connectionId } = await params;
  const formData = await request.formData();
  const action = formData.get("action");
  const fallbackPath = `/connections/${connectionId}`;
  const returnPath = safeReturnPath(formData.get("returnTo") as string | null, fallbackPath);

  const connection = await prisma.connection.findFirst({
    where: {
      id: connectionId,
      status: ConnectionStatus.ACTIVE,
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
  });

  if (!connection) {
    return NextResponse.redirect(new URL("/inbox", request.url));
  }

  const otherUserId = connection.userAId === user.id ? connection.userBId : connection.userAId;

  const friendLink = await prisma.friendLink.findUnique({
    where: { connectionId },
  });

  const redirectBack = () =>
    NextResponse.redirect(new URL(returnPath, request.url));

  if (action === "request") {
    if (friendLink?.status === FriendLinkStatus.ACCEPTED) {
      return redirectBack();
    }
    if (friendLink?.status === FriendLinkStatus.PENDING && friendLink.requesterId !== user.id) {
      return redirectBack();
    }
    await prisma.friendLink.upsert({
      where: { connectionId },
      create: {
        connectionId,
        requesterId: user.id,
        responderId: otherUserId,
        status: FriendLinkStatus.PENDING,
      },
      update: {
        requesterId: user.id,
        responderId: otherUserId,
        status: FriendLinkStatus.PENDING,
      },
    });
    return redirectBack();
  }

  if (action === "accept") {
    if (
      !friendLink ||
      friendLink.status !== FriendLinkStatus.PENDING ||
      friendLink.responderId !== user.id
    ) {
      return redirectBack();
    }
    await prisma.friendLink.update({
      where: { connectionId },
      data: { status: FriendLinkStatus.ACCEPTED },
    });
    return redirectBack();
  }

  if (action === "decline") {
    if (
      !friendLink ||
      friendLink.status !== FriendLinkStatus.PENDING ||
      friendLink.responderId !== user.id
    ) {
      return redirectBack();
    }
    await prisma.friendLink.update({
      where: { connectionId },
      data: { status: FriendLinkStatus.DECLINED },
    });
    return redirectBack();
  }

  if (action === "cancel") {
    if (
      !friendLink ||
      friendLink.status !== FriendLinkStatus.PENDING ||
      friendLink.requesterId !== user.id
    ) {
      return redirectBack();
    }
    await prisma.friendLink.update({
      where: { connectionId },
      data: { status: FriendLinkStatus.DECLINED },
    });
    return redirectBack();
  }

  return redirectBack();
}
