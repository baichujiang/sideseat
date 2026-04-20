import { ConnectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const user = await requireOnboardedUser();
  const { connectionId } = await params;

  await prisma.connection.updateMany({
    where: {
      id: connectionId,
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    data: {
      status: ConnectionStatus.ENDED,
      endedById: user.id,
      endedAt: new Date(),
    },
  });

  return NextResponse.redirect(new URL("/inbox", request.url));
}
