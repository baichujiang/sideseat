import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import {
  getAvailabilityDaysForUser,
  isAvailabilityShareActive,
  normalizeAvailabilityIncludedDates,
  rangeFitsAvailability,
} from "@/lib/queries/chat-planning";
import { planRequestCreateSchema } from "@/lib/validators/chat-planning";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { shareId } = await params;
    const values = await parseJson(request, planRequestCreateSchema);

    const share = await prisma.availabilityShare.findFirst({
      where: {
        id: shareId,
        connection: {
          OR: [{ userAId: user.id }, { userBId: user.id }],
        },
      },
      include: {
        connection: {
          select: { id: true, userAId: true, userBId: true, status: true },
        },
      },
    });

    if (!share || share.connection.status !== "ACTIVE") {
      return error("Availability not found.", 404);
    }
    if (!isAvailabilityShareActive(share)) {
      return error("This availability is no longer available.", 409);
    }
    if (share.ownerUserId === user.id) {
      return error("You can't suggest against your own availability.", 400);
    }

    const startTime = new Date(values.startTime);
    const endTime = new Date(values.endTime);
    const included = normalizeAvailabilityIncludedDates(share.includedDates);
    const days = await prisma.$transaction((tx) =>
      getAvailabilityDaysForUser(tx, share.ownerUserId, share.rangeStart, share.rangeEnd, included),
    );

    if (!rangeFitsAvailability(days, startTime, endTime)) {
      return error("This time is no longer available. Please choose another slot.", 409);
    }

    const result = await prisma.$transaction(async (tx) => {
      const planRequest = await tx.planRequest.create({
        data: {
          connectionId: share.connectionId,
          availabilityShareId: share.id,
          proposerUserId: user.id,
          receiverUserId: share.ownerUserId,
          planType: values.planType,
          title: values.title.trim(),
          location: values.location?.trim() || null,
          message: values.message?.trim() || null,
          startTime,
          endTime,
        },
      });

      const message = await tx.message.create({
        data: {
          connectionId: share.connectionId,
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
    console.error(cause);
    return error("Unable to send plan request.");
  }
}
