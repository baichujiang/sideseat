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
  if (!plan) return { hasHistory: false, source: null, discoveryAllowed: true };
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
    // Missing feedback is not a refusal. Explicit opt-outs and safety remain
    // private hard stops even for an unrelated new discovery.
    discoveryAllowed: plan.connection.status === "ACTIVE" &&
      !plan.commitment?.safetyRestrictedAt &&
      !plan.meetAgainPermissions.some(row => row.value === "NO" || row.value === "WITHDRAWN"),
    source: eligible ? { planId: plan.id, endedAt: plan.endTime } : null,
  };
}

export async function invalidatePendingRepeats(
  tx: Prisma.TransactionClient,
  planId: string,
) {
  const plan = await tx.planRequest.findUnique({ where: { id: planId },
    select: { proposerUserId: true, receiverUserId: true } });
  const blocksDiscovery = plan && !(await repeatEligibility(tx, plan.proposerUserId, plan.receiverUserId, new Date())).discoveryAllowed;
  await tx.mutualOpportunity.updateMany({
    where: { status: "PENDING", OR: [
      { repeatOfPlanId: planId },
      ...(blocksDiscovery ? [{
        userAId: { in: [plan.proposerUserId, plan.receiverUserId] },
        userBId: { in: [plan.proposerUserId, plan.receiverUserId] },
        contextSnapshot: { path: ["activityFit", "policyVersion"], equals: "DISCOVERY_FIT_V1" },
      }] : []),
    ] },
    data: { status: "UNAVAILABLE", terminalAt: new Date(), version: { increment: 1 } },
  });
}
