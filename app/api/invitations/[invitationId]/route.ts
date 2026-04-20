import { ConnectionStatus, InvitationStatus } from "@prisma/client";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { invitationDecisionSchema } from "@/lib/validators/invitation";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ invitationId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { invitationId } = await params;
    const { action } = await parseJson(request, invitationDecisionSchema);
    const invitation = await prisma.invitation.findUnique({
      where: { id: invitationId },
    });

    if (!invitation) {
      return error("Invitation not found.", 404);
    }

    if (![invitation.receiverId, invitation.senderId].includes(user.id)) {
      return error("You cannot manage this invitation.", 403);
    }

    if (invitation.status !== InvitationStatus.PENDING) {
      return error("This invitation is no longer pending.", 409);
    }

    if (action === "accept") {
      if (invitation.receiverId !== user.id) {
        return error("Only the receiver can accept.");
      }

      await prisma.$transaction(async (tx) => {
        await tx.invitation.update({
          where: { id: invitationId },
          data: { status: InvitationStatus.ACCEPTED },
        });

        await tx.connection.create({
          data: {
            invitationId: invitation.id,
            userAId: invitation.senderId,
            userBId: invitation.receiverId,
            status: ConnectionStatus.ACTIVE,
          },
        });
      });

      return ok({ accepted: true });
    }

    if (action === "decline") {
      if (invitation.receiverId !== user.id) {
        return error("Only the receiver can decline.");
      }

      await prisma.invitation.update({
        where: { id: invitationId },
        data: { status: InvitationStatus.DECLINED },
      });

      return ok({ declined: true });
    }

    if (action === "cancel") {
      if (invitation.senderId !== user.id) {
        return error("Only the sender can cancel.");
      }

      await prisma.invitation.update({
        where: { id: invitationId },
        data: { status: InvitationStatus.CANCELED },
      });

      return ok({ canceled: true });
    }

    return error("Unsupported action.");
  } catch (cause) {
    console.error(cause);
    return error("Unable to update invitation.");
  }
}
