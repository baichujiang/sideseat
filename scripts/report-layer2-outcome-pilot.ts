import { prisma } from "@/lib/db/prisma";
import {
  evaluateLayer2PilotSnapshot,
  INTERNAL_ACCOUNT_PREFIXES,
  INTERNAL_ACCOUNT_USERNAMES,
  isInternalAccount,
  LAYER2_PILOT_GATE,
  percentage,
  summarizeLayer2Pilot,
} from "@/lib/analytics/layer2-outcome-pilot";

async function main() {
  const generatedAt = new Date();
  const windowStart = new Date(
    generatedAt.getTime() -
      LAYER2_PILOT_GATE.windowDays * 24 * 60 * 60 * 1_000,
  );
  const candidates = await prisma.planRequest.findMany({
    where: {
      status: "ACCEPTED",
      endTime: { gte: windowStart, lte: generatedAt },
      connection: {
        status: "ACTIVE",
        userA: { moderationBlocks: { none: { isActive: true } } },
        userB: { moderationBlocks: { none: { isActive: true } } },
      },
      AND: [
        {
          OR: [
            { commitmentId: null },
            {
              acceptedForCommitment: {
                is: { status: "CONFIRMED", safetyRestrictedAt: null },
              },
            },
          ],
        },
      ],
    },
    select: {
      proposerUserId: true,
      receiverUserId: true,
      proposer: { select: { username: true } },
      receiver: { select: { username: true } },
      outcomeResponses: { select: { userId: true, value: true } },
    },
  });

  const nonQaPlans = candidates.filter(
    (plan) =>
      !isInternalAccount(plan.proposer.username) &&
      !isInternalAccount(plan.receiver.username),
  );
  const metrics = summarizeLayer2Pilot(
    nonQaPlans.map((plan) => ({
      participantAId: plan.proposerUserId,
      participantBId: plan.receiverUserId,
      responses: plan.outcomeResponses,
    })),
  );
  const snapshot = evaluateLayer2PilotSnapshot(metrics);

  process.stdout.write(
    `${JSON.stringify(
      {
        generatedAt: generatedAt.toISOString(),
        window: {
          days: LAYER2_PILOT_GATE.windowDays,
          start: windowStart.toISOString(),
          end: generatedAt.toISOString(),
        },
        scope: {
          eligibleEndedAcceptedPlanCandidates: candidates.length,
          excludedInternalOrQaPlans: candidates.length - nonQaPlans.length,
          internalAccountRule: {
            exactUsernameCount: INTERNAL_ACCOUNT_USERNAMES.size,
            prefixes: INTERNAL_ACCOUNT_PREFIXES,
          },
          privacy: "aggregate-only; no user or Plan identifiers emitted",
        },
        metrics: {
          ...metrics,
          participantResponseCoveragePercent: percentage(
            metrics.participantResponseCoverage,
          ),
          bilateralPlanCoveragePercent: percentage(
            metrics.bilateralPlanCoverage,
          ),
        },
        currentSnapshot: {
          qualifies: snapshot.qualifies,
          checks: snapshot.checks,
          unmetChecks: snapshot.unmetChecks,
        },
        gate: {
          thresholds: LAYER2_PILOT_GATE,
          decisionRule:
            "Record two qualifying snapshots at least 7 days apart before entering Layer 3.",
          silenceTreatment: "missing, never DID_NOT_OCCUR",
        },
      },
      null,
      2,
    )}\n`,
  );
}

main()
  .catch((cause) => {
    console.error(cause);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
