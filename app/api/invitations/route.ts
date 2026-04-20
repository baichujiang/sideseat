import { ClientSignalAction, InvitationStatus } from "@prisma/client";
import { subMinutes } from "date-fns";

import {
  INVITATION_RATE_LIMIT_COUNT,
  INVITATION_RATE_LIMIT_WINDOW_MINUTES,
} from "@/lib/constants/app";
import { recordClientSignal } from "@/lib/abuse/client-signals";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { invitationSchema } from "@/lib/validators/invitation";

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const values = await parseJson(request, invitationSchema);

    if (user.id === values.receiverId) {
      return error("You cannot invite yourself.");
    }

    if (!user.verifiedStudent) {
      return error("Verify your student status before sending invitations.", 403);
    }

    const [sharedCourse, block, moderationBlock, recentCount, pendingInvitation, declinedInvitation] =
      await Promise.all([
        prisma.userCourse.findFirst({
          where: {
            userId: user.id,
            courseId: values.courseId,
            course: {
              members: {
                some: {
                  userId: values.receiverId,
                },
              },
            },
          },
        }),
        prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: user.id, blockedId: values.receiverId },
              { blockerId: values.receiverId, blockedId: user.id },
            ],
          },
        }),
        prisma.moderationBlock.findFirst({
          where: {
            userId: {
              in: [user.id, values.receiverId],
            },
            isActive: true,
          },
        }),
        prisma.invitation.count({
          where: {
            senderId: user.id,
            createdAt: {
              gte: subMinutes(new Date(), INVITATION_RATE_LIMIT_WINDOW_MINUTES),
            },
          },
        }),
        prisma.invitation.findFirst({
          where: {
            senderId: user.id,
            receiverId: values.receiverId,
            courseId: values.courseId,
            status: InvitationStatus.PENDING,
          },
        }),
        prisma.invitation.findFirst({
          where: {
            senderId: user.id,
            receiverId: values.receiverId,
            status: InvitationStatus.DECLINED,
          },
          orderBy: {
            updatedAt: "desc",
          },
        }),
      ]);

    if (!sharedCourse) {
      return error("Invitations must be tied to a valid shared course.");
    }

    if (block) {
      return error("This user is unavailable for contact.");
    }

    if (moderationBlock) {
      return error("This user is unavailable for contact.");
    }

    if (recentCount >= INVITATION_RATE_LIMIT_COUNT) {
      return error("You have reached the invitation limit for now. Please slow down.");
    }

    if (pendingInvitation) {
      return error("You already have a pending invitation in this shared context.");
    }

    if (declinedInvitation) {
      return error("You cannot keep retrying after a rejection in the MVP.");
    }

    const invitation = await prisma.invitation.create({
      data: {
        senderId: user.id,
        receiverId: values.receiverId,
        courseId: values.courseId,
        type: values.type,
        note: user.allowInvitationNotes ? values.note || null : null,
        expiresAt: subMinutes(new Date(), -60 * 24 * 7),
      },
    });

    await recordClientSignal({
      request,
      action: ClientSignalAction.INVITATION_SENT,
      wasSuccessful: true,
      userId: user.id,
      attemptedEmail: user.email ?? undefined,
      clientContext: values.clientContext,
    });

    return ok(invitation, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to send invitation.");
  }
}
