import { ConnectionStatus } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { messageSchema } from "@/lib/validators/invitation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { connectionId } = await params;
    const values = await parseJson(request, messageSchema);

    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        status: ConnectionStatus.ACTIVE,
        userA: {
          moderationBlocks: {
            none: {
              isActive: true,
            },
          },
        },
        userB: {
          moderationBlocks: {
            none: {
              isActive: true,
            },
          },
        },
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
    });

    if (!connection) {
      return error("Connection not found.", 404);
    }

    // Validate replyToId: must belong to the same connection and not be
    // a deleted (tombstoned) row. We fall back to null on mismatch rather
    // than erroring, so a stale client state doesn't block sending.
    let replyToId: string | null = null;
    if (values.replyToId) {
      const target = await prisma.message.findFirst({
        where: {
          id: values.replyToId,
          connectionId,
          deletedAt: null,
        },
        select: { id: true },
      });
      if (target) replyToId = target.id;
    }

    const message = await prisma.message.create({
      data: {
        connectionId,
        senderId: user.id,
        body: values.body.trim(),
        replyToId,
      },
    });

    return ok(message, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to send message.");
  }
}
