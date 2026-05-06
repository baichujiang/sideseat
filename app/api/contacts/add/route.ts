import { ConnectionStatus } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { contactAddSchema } from "@/lib/validators/chat-directory";

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const values = await parseJson(request, contactAddSchema);

    if (values.peerId === user.id) {
      return error("You are already in your own notes chat.");
    }

    const [peer, mutualBlock, moderated, existingConnection] = await Promise.all([
      prisma.user.findUnique({
        where: { id: values.peerId },
        select: { id: true, isGuest: true, onboardingComplete: true },
      }),
      prisma.block.findFirst({
        where: {
          OR: [
            { blockerId: user.id, blockedId: values.peerId },
            { blockerId: values.peerId, blockedId: user.id },
          ],
        },
        select: { id: true },
      }),
      prisma.moderationBlock.findFirst({
        where: {
          userId: { in: [user.id, values.peerId] },
          isActive: true,
        },
        select: { id: true },
      }),
      prisma.connection.findFirst({
        where: {
          OR: [
            { userAId: user.id, userBId: values.peerId },
            { userAId: values.peerId, userBId: user.id },
          ],
        },
        select: { id: true, status: true },
      }),
    ]);

    if (!peer || peer.isGuest || !peer.onboardingComplete) {
      return error("That user is not available.", 404);
    }
    if (mutualBlock || moderated) {
      return error("This user is unavailable for contact.", 403);
    }
    if (existingConnection?.status === ConnectionStatus.ACTIVE) {
      return ok({ connectionId: existingConnection.id, created: false }, { status: 200 });
    }
    if (existingConnection) {
      return error("This conversation is no longer available.", 409);
    }

    const connection = await prisma.connection.create({
      data: {
        userAId: user.id,
        userBId: values.peerId,
        status: ConnectionStatus.ACTIVE,
      },
      select: { id: true },
    });

    return ok({ connectionId: connection.id, created: true }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to add contact.");
  }
}
