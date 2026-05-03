import { ConnectionStatus } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { createProposalSchema } from "@/lib/validators/study-session";

/**
 * Create a lightweight activity proposal in a 1:1 chat.
 *
 * Rate-limiting: we rely on the composer flow + small UI friction (sheet +
 * form) rather than a dedicated limit. If abuse shows up, add a per-user +
 * per-connection cap here (e.g., 5 open proposals / hour).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { connectionId } = await params;
    const values = await parseJson(request, createProposalSchema);

    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        status: ConnectionStatus.ACTIVE,
        userA: { moderationBlocks: { none: { isActive: true } } },
        userB: { moderationBlocks: { none: { isActive: true } } },
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      select: { id: true },
    });

    if (!connection) {
      return error("Connection not found.", 404);
    }

    const proposal = await prisma.studySessionProposal.create({
      data: {
        proposerId: user.id,
        connectionId,
        activityType: values.activityType,
        startAt: values.startAt,
        endAt: values.endAt,
        location: values.location ? values.location : null,
        note: values.note ? values.note : null,
      },
    });

    return ok(proposal, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to create proposal.");
  }
}
