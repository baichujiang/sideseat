import { ConnectionStatus, MessageType } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

/**
 * Soft-delete user-authored 1:1 content. Workflow cards are server-owned
 * projections and must remain visible until their own lifecycle action runs.
 * We keep deleted content rows so quoted replies retain a tombstone anchor.
 */
export async function DELETE(
  _request: Request,
  {
    params,
  }: {
    params: Promise<{ connectionId: string; messageId: string }>;
  },
) {
  try {
    const user = await requireOnboardedUser();
    const { connectionId, messageId } = await params;

    const message = await prisma.message.findFirst({
      where: {
        id: messageId,
        connectionId,
        senderId: user.id,
        deletedAt: null,
        type: {
          in: [MessageType.TEXT, MessageType.IMAGE, MessageType.LOCATION],
        },
        connection: {
          status: ConnectionStatus.ACTIVE,
          OR: [{ userAId: user.id }, { userBId: user.id }],
        },
      },
      select: { id: true },
    });

    if (!message) {
      return error("Message not found or not yours to delete.", 404);
    }

    await prisma.message.update({
      where: { id: message.id },
      data: { deletedAt: new Date(), body: "" },
    });

    return ok({ id: message.id });
  } catch (cause) {
    console.error(cause);
    return error("Unable to delete message.");
  }
}
