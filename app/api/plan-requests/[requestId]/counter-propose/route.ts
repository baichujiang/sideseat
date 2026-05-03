import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { counterProposeSchema } from "@/lib/validators/chat-planning";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { requestId } = await params;
    const values = await parseJson(request, counterProposeSchema);

    const planRequest = await prisma.planRequest.findFirst({
      where: {
        id: requestId,
        connection: {
          OR: [{ userAId: user.id }, { userBId: user.id }],
          status: "ACTIVE",
        },
      },
    });

    if (!planRequest) {
      return error("Plan request not found.", 404);
    }
    if (planRequest.receiverUserId !== user.id) {
      return error("Only the receiver can suggest another time.", 403);
    }
    if (planRequest.status !== "PENDING") {
      return error("This request is no longer pending.", 409);
    }

    const startTime = new Date(values.startTime);
    const endTime = new Date(values.endTime);

    const result = await prisma.$transaction(async (tx) => {
      await tx.planRequest.update({
        where: { id: planRequest.id },
        data: { status: "COUNTER_PROPOSED" },
      });

      const counter = await tx.planRequest.create({
        data: {
          connectionId: planRequest.connectionId,
          availabilityShareId: null,
          counterOfId: planRequest.id,
          proposerUserId: user.id,
          receiverUserId: planRequest.proposerUserId,
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
          connectionId: planRequest.connectionId,
          senderId: user.id,
          body: "",
          type: "PLAN_REQUEST_CARD",
          planRequestId: counter.id,
        },
      });

      return { counter, message };
    });

    return ok(result, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to suggest another time.");
  }
}
