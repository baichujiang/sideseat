import "server-only";

import { Prisma, type PlanOriginKind } from "@prisma/client";

type AcceptedMutualPlanSource = Readonly<{
  connectionId: string;
  originKind: PlanOriginKind | null;
  originId: string | null;
  acceptedAt: Date;
}>;

/**
 * Close only the discovery supply that produced an accepted one-to-one Plan.
 *
 * The MutualOpportunity row intentionally remains MUTUAL as immutable history:
 * it records that both people consented and a contextual conversation opened.
 * An ACCEPTED PlanRequest is the source of truth for commitment, while the two
 * source WeeklyIntents become terminal and stop generating further matches.
 */
export async function finalizeAcceptedMutualOpportunityPlan(
  tx: Prisma.TransactionClient,
  source: AcceptedMutualPlanSource,
) {
  if (source.originKind !== "MUTUAL_OPPORTUNITY" || !source.originId) {
    return null;
  }

  // Resolve immutable foreign keys without taking a row lock, then follow the
  // shared lifecycle lock order: WeeklyIntent -> MutualOpportunity. Weekly
  // intent edit/pause/end and candidate creation use the same order.
  const opportunitySnapshot = await tx.mutualOpportunity.findFirst({
    where: {
      id: source.originId,
      connectionId: source.connectionId,
      status: "MUTUAL",
    },
    select: {
      id: true,
      intentAId: true,
      intentBId: true,
    },
  });
  if (!opportunitySnapshot) return null;

  const intentIds = [
    opportunitySnapshot.intentAId,
    opportunitySnapshot.intentBId,
  ].sort();
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "WeeklyIntent"
    WHERE "id" IN (${Prisma.join(intentIds)})
    ORDER BY "id"
    FOR UPDATE
  `);

  // Lock the immutable MUTUAL source and every PENDING sibling in stable ID
  // order before changing either lifecycle. This avoids an implicit updateMany
  // lock order differing from the decision/create paths.
  const affectedOpportunityIds = (
    await tx.mutualOpportunity.findMany({
      where: {
        OR: [
          { id: source.originId },
          {
            status: "PENDING",
            OR: [
              { intentAId: { in: intentIds } },
              { intentBId: { in: intentIds } },
            ],
          },
        ],
      },
      select: { id: true },
    })
  ).map(({ id }) => id).sort();
  if (affectedOpportunityIds.length === 0) return null;

  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "MutualOpportunity"
    WHERE "id" IN (${Prisma.join(affectedOpportunityIds)})
    ORDER BY "id"
    FOR UPDATE
  `);

  const opportunity = await tx.mutualOpportunity.findFirst({
    where: {
      id: source.originId,
      connectionId: source.connectionId,
      status: "MUTUAL",
      intentAId: opportunitySnapshot.intentAId,
      intentBId: opportunitySnapshot.intentBId,
    },
    select: { id: true },
  });
  if (!opportunity) return null;

  const endedIntents = await tx.weeklyIntent.updateMany({
    where: {
      id: { in: intentIds },
      status: { in: ["ACTIVE", "PAUSED"] },
    },
    data: {
      status: "ENDED",
      endedAt: source.acceptedAt,
      pausedAt: null,
      version: { increment: 1 },
    },
  });
  const closedPendingOpportunities = await tx.mutualOpportunity.updateMany({
    where: {
      id: { in: affectedOpportunityIds },
      status: "PENDING",
    },
    data: {
      status: "UNAVAILABLE",
      terminalAt: source.acceptedAt,
      version: { increment: 1 },
    },
  });

  return {
    opportunityId: opportunity.id,
    endedIntentCount: endedIntents.count,
    closedPendingOpportunityCount: closedPendingOpportunities.count,
  };
}
