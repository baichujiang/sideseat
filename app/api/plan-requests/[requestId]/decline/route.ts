import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

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
    });

    if (!planRequest) {
      return error("Plan request not found.", 404);
    }
    if (planRequest.receiverUserId !== user.id) {
      return error("Only the receiver can decline this request.", 403);
    }
    if (planRequest.status !== "PENDING") {
      return error("This request is no longer pending.", 409);
    }

    await prisma.$transaction(async (tx) => {
      await tx.planRequest.update({
        where: { id: planRequest.id },
        data: { status: "DECLINED" },
      });

      await tx.message.create({
        data: {
          connectionId: planRequest.connectionId,
          senderId: user.id,
          body: "Declined the plan request.",
          type: "SYSTEM",
          planRequestId: planRequest.id,
        },
      });
    });

    return ok({ status: "declined" });
  } catch (cause) {
    console.error(cause);
    return error("Unable to decline plan request.");
  }
}
