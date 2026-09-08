import type { Prisma } from "@prisma/client";

/** Caller owns the canonical pair safety lock. Never serialize this result. */
export async function repeatEligibility(
  tx: Prisma.TransactionClient,
  firstUserId: string,
  secondUserId: string,
  now: Date,
) {
  const plan = await tx.planRequest.findFirst({
    where: {
      status: "ACCEPTED",
      endTime: { lte: now },
      OR: [
        { proposerUserId: firstUserId, receiverUserId: secondUserId },
        { proposerUserId: secondUserId, receiverUserId: firstUserId },
      ],
    },
    orderBy: [{ endTime: "desc" }, { id: "desc" }],
    select: {
      id: true,
      endTime: true,
      connection: { select: { status: true } },
      commitment: {
        select: { status: true, safetyRestrictedAt: true, currentAcceptedRevisionId: true },
      },
      sharedEncounter: { select: { id: true } },
      meetAgainPermissions: { select: { userId: true, value: true } },
    },
  });
  if (!plan) return { hasHistory: false, source: null };
  const yes = new Set(plan.meetAgainPermissions
    .filter((row) => row.value === "YES").map((row) => row.userId));
  const eligible = plan.sharedEncounter !== null &&
    plan.connection.status === "ACTIVE" &&
    (!plan.commitment || (plan.commitment.status === "CONFIRMED" &&
      plan.commitment.safetyRestrictedAt === null &&
      plan.commitment.currentAcceptedRevisionId === plan.id)) &&
    yes.has(firstUserId) && yes.has(secondUserId);
  return {
    hasHistory: true,
    source: eligible ? { planId: plan.id, endedAt: plan.endTime } : null,
  };
}

export async function invalidatePendingRepeats(
  tx: Prisma.TransactionClient,
  planId: string,
) {
  await tx.mutualOpportunity.updateMany({
    where: { repeatOfPlanId: planId, status: "PENDING" },
    data: { status: "UNAVAILABLE", terminalAt: new Date(), version: { increment: 1 } },
  });
}
