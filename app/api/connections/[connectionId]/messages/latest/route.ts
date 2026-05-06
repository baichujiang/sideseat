import { ConnectionStatus } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { ok, error } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { connectionId } = await params;

    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      select: { id: true },
    });

    if (!connection) {
      return error("Connection not found.", 404);
    }

    const [latest, messageCount] = await Promise.all([
      prisma.message.findFirst({
        where: { connectionId },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
      prisma.message.count({ where: { connectionId } }),
    ]);

    return ok({
      latestMessageId: latest?.id ?? null,
      latestMessageAt: latest?.createdAt.toISOString() ?? null,
      messageCount,
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load latest message.");
  }
}
