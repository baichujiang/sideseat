import { ConnectionStatus } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import {
  LegacyPlanTransitionConflictError,
  lockLegacyPlanConnectionSafety,
} from "@/lib/plans/legacy-plan-commitment-compat";
import { planRequestCreateSchema } from "@/lib/validators/chat-planning";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { connectionId } = await params;
    const values = await parseJson(request, planRequestCreateSchema);

    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        status: ConnectionStatus.ACTIVE,
        userA: { moderationBlocks: { none: { isActive: true } } },
        userB: { moderationBlocks: { none: { isActive: true } } },
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      select: {
        id: true,
        userAId: true,
        userBId: true,
      },
    });

    if (!connection) {
      return error("Connection not found.", 404);
    }

    const receiverUserId =
      values.receiverUserId ??
      (connection.userAId === user.id ? connection.userBId : connection.userAId);

    if (receiverUserId === user.id) {
      return error("Choose another person for this plan.", 400);
    }

    const startTime = new Date(values.startTime);
    const endTime = new Date(values.endTime);

    const result = await prisma.$transaction(async (tx) => {
      await lockLegacyPlanConnectionSafety(tx, {
        connectionId,
        actorId: user.id,
        expectedPeerId: receiverUserId,
      });
      const planRequest = await tx.planRequest.create({
        data: {
          connectionId,
          proposerUserId: user.id,
          receiverUserId,
          planType: values.planType ?? "CUSTOM",
          title: values.title.trim(),
          location: values.location?.trim() || null,
          message: values.message?.trim() || null,
          startTime,
          endTime,
        },
      });

      const message = await tx.message.create({
        data: {
          connectionId,
          senderId: user.id,
          body: "",
          type: "PLAN_REQUEST_CARD",
          planRequestId: planRequest.id,
        },
      });

      return { planRequest, message };
    });

    return ok(result, { status: 201 });
  } catch (cause) {
    if (cause instanceof LegacyPlanTransitionConflictError) {
      return error("Connection not found.", 404);
    }
    console.error(cause);
    return error("Unable to send plan request.");
  }
}
