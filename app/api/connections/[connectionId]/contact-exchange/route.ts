import { ContactExchangeStatus, ConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const user = await requireOnboardedUser();
  const { connectionId } = await params;
  const formData = await request.formData();
  const action = formData.get("action");

  const connection = await prisma.connection.findFirst({
    where: {
      id: connectionId,
      status: ConnectionStatus.ACTIVE,
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    include: {
      userA: true,
      userB: true,
    },
  });

  if (!connection) {
    return NextResponse.redirect(new URL("/inbox", request.url));
  }

  const otherUserId = connection.userAId === user.id ? connection.userBId : connection.userAId;

  if (action === "request") {
    await prisma.contactExchangeRequest.create({
      data: {
        connectionId,
        requesterId: user.id,
        responderId: otherUserId,
        status: ContactExchangeStatus.PENDING,
      },
    });
  }

  if (action === "accept") {
    await prisma.contactExchangeRequest.updateMany({
      where: {
        connectionId,
        responderId: user.id,
        status: ContactExchangeStatus.PENDING,
      },
      data: {
        status: ContactExchangeStatus.ACCEPTED,
      },
    });
  }

  return NextResponse.redirect(new URL(`/connections/${connectionId}`, request.url));
}
