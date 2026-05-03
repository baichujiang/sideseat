import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";
import {
  getAvailabilityDaysForUser,
  isAvailabilityShareActive,
  materializePlanCalendarEntries,
  normalizeAvailabilityIncludedDates,
  rangeFitsAvailability,
} from "@/lib/queries/chat-planning";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { requestId } = await params;

    const planRequest = await prisma.planRequest.findFirst({
      where: {
        id: requestId,
        connection: {
          OR: [{ userAId: user.id }, { userBId: user.id }],
          status: "ACTIVE",
        },
      },
      include: {
        availabilityShare: true,
        proposer: {
          select: { id: true, nickname: true, username: true },
        },
        receiver: {
          select: { id: true, nickname: true, username: true },
        },
      },
    });

    if (!planRequest) {
      return error("Plan request not found.", 404);
    }
    if (planRequest.receiverUserId !== user.id) {
      return error("Only the receiver can accept this request.", 403);
    }
    if (planRequest.status !== "PENDING") {
      return error("This request is no longer pending.", 409);
    }

    if (planRequest.availabilityShareId && planRequest.availabilityShare) {
      if (!isAvailabilityShareActive(planRequest.availabilityShare)) {
        return error("This time is no longer available. Please choose another slot.", 409);
      }
      const included = normalizeAvailabilityIncludedDates(
        planRequest.availabilityShare!.includedDates,
      );
      const days = await prisma.$transaction((tx) =>
        getAvailabilityDaysForUser(
          tx,
          planRequest.receiverUserId,
          planRequest.availabilityShare!.rangeStart,
          planRequest.availabilityShare!.rangeEnd,
          included,
        ),
      );
      if (
        !rangeFitsAvailability(
          days,
          planRequest.startTime,
          planRequest.endTime,
        )
      ) {
        return error("This time is no longer available. Please choose another slot.", 409);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const accepted = await tx.planRequest.update({
        where: { id: planRequest.id },
        data: { status: "ACCEPTED" },
      });

      await materializePlanCalendarEntries(tx, {
        planRequestId: planRequest.id,
        proposerUserId: planRequest.proposerUserId,
        proposerName: planRequest.proposer.nickname ?? planRequest.proposer.username,
        receiverUserId: planRequest.receiverUserId,
        receiverName: planRequest.receiver.nickname ?? planRequest.receiver.username,
        title: planRequest.title,
        planType: planRequest.planType,
        location: planRequest.location,
        note: planRequest.message,
        startTime: planRequest.startTime,
        endTime: planRequest.endTime,
      });

      const confirmation = await tx.message.create({
        data: {
          connectionId: planRequest.connectionId,
          senderId: user.id,
          body: "Plan confirmed",
          type: "PLAN_CONFIRMED_CARD",
          planRequestId: planRequest.id,
        },
      });

      return { accepted, confirmation };
    });

    return ok(result);
  } catch (cause) {
    console.error(cause);
    return error("Unable to accept plan request.");
  }
}
