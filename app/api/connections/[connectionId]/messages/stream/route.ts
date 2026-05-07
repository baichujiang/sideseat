import { ConnectionStatus } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { latestMessageIdSseResponse } from "@/lib/chat/latest-message-id-sse";
import { CHAT_SSE_POLL_MS } from "@/lib/constants/app";
import { prisma } from "@/lib/db/prisma";
import { error } from "@/lib/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
/** Vercel caps vary by plan; client reconnects when the stream ends. */
export const maxDuration = 300;

export async function GET(
  request: Request,
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

    return latestMessageIdSseResponse(request, {
      pollIntervalMs: CHAT_SSE_POLL_MS,
      getLatestMessageId: async () => {
        const latest = await prisma.message.findFirst({
          where: { connectionId },
          orderBy: { createdAt: "desc" },
          select: { id: true },
        });
        return latest?.id ?? null;
      },
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to open message stream.");
  }
}
