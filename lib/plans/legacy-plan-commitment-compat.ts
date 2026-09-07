import {
  Prisma,
  type PlanOutcomeValue,
  type PlanRequest,
  type PlanRevisionKind,
} from "@prisma/client";

import {
  canonicalPair,
  pairSafetyLock,
  userConnectionSafetyLocks,
} from "@/lib/v2/action-coordination/db-locks";

type DbClient = Prisma.TransactionClient;

async function syncSharedEncounter(
  tx: DbClient,
  options: {
    planId: string;
    planCommitmentId: string | null;
    participantAId: string;
    participantBId: string;
  },
) {
  const scope = options.planCommitmentId
    ? { planCommitmentId: options.planCommitmentId }
    : { planId: options.planId };
  const occurred = await tx.planOutcomeResponse.findMany({
    where: {
      ...scope,
      value: "OCCURRED",
      userId: { in: [options.participantAId, options.participantBId] },
    },
    select: { userId: true },
  });
  const occurredUserIds = new Set(occurred.map((row) => row.userId));
  const bothOccurred =
    options.participantAId !== options.participantBId &&
    occurredUserIds.has(options.participantAId) &&
    occurredUserIds.has(options.participantBId);

  if (!bothOccurred) {
    await tx.sharedEncounter.deleteMany({ where: scope });
    return;
  }

  if (options.planCommitmentId) {
    await tx.sharedEncounter.upsert({
      where: { planCommitmentId: options.planCommitmentId },
      create: {
        planId: options.planId,
        planCommitmentId: options.planCommitmentId,
      },
      update: { planId: options.planId },
    });
    return;
  }

  await tx.sharedEncounter.upsert({
    where: { planId: options.planId },
    create: { planId: options.planId },
    update: {},
  });
}

export class LegacyPlanTransitionConflictError extends Error {
  constructor(message = "This plan request is no longer actionable.") {
    super(message);
    this.name = "LegacyPlanTransitionConflictError";
  }
}

export type LegacyPlanPolicyRecovery =
  | Readonly<{
      action: "OPEN_PLAN";
      focus: Readonly<{
        type: "PLAN";
        connectionId: string;
        commitmentId: string;
        revisionId: string;
      }>;
    }>
  | Readonly<{
      action: "OPEN_ACTION_CONTEXT";
      focus: Readonly<{
        type: "ACTION_CONTEXT";
        connectionId: string;
        contextId: string;
      }>;
    }>;

export const LEGACY_PLAN_POLICY_UNSUPPORTED_MESSAGE =
  "This Plan must be updated through its current coordination flow." as const;

export class LegacyPlanPolicyUnsupportedError extends Error {
  readonly code = "COORDINATION_POLICY_UNSUPPORTED" as const;

  constructor(readonly recovery: LegacyPlanPolicyRecovery | null) {
    super(LEGACY_PLAN_POLICY_UNSUPPORTED_MESSAGE);
    this.name = "LegacyPlanPolicyUnsupportedError";
  }
}

export type StableCounterInheritance = Readonly<{
  actionInterestId: string | null;
  commitmentId: string;
  revisionKind: PlanRevisionKind;
  originActionId: string | null;
  originContextId: string | null;
  originKind: PlanRequest["originKind"];
  originId: string | null;
  originSnapshot?: Prisma.InputJsonValue;
}>;

type LockedTransition = Readonly<{
  revision: PlanRequest;
  commitment: {
    id: string;
    connectionId: string;
    participantAId: string;
    participantBId: string;
    status: "NEGOTIATING" | "CONFIRMED" | "CLOSED" | "CANCELED";
    currentAcceptedRevisionId: string | null;
    currentPendingRevisionId: string | null;
    safetyRestrictedAt: Date | null;
  } | null;
}>;

export type LockedLegacyPlanConnection = Readonly<{
  id: string;
  userAId: string;
  userBId: string;
  status: "ACTIVE" | "ENDED" | "BLOCKED";
}>;

type LegacyPlanConnectionSafetyOptions = Readonly<{
  connectionId: string;
  actorId?: string;
  expectedPeerId?: string;
  expectedParticipantIds?: readonly [string, string];
  allowEnded?: boolean;
}>;

/**
 * Resolve the pair without a row lock, then enter the global safety order:
 * endpoint user locks -> canonical pair lock -> durable safety barriers ->
 * Connection. Every legacy Plan writer uses this scope before Plan rows.
 */
export async function lockLegacyPlanConnectionSafety(
  tx: DbClient,
  options: LegacyPlanConnectionSafetyOptions,
): Promise<LockedLegacyPlanConnection> {
  const snapshot = await tx.connection.findUnique({
    where: { id: options.connectionId },
    select: { id: true, userAId: true, userBId: true },
  });
  if (!snapshot || snapshot.userAId === snapshot.userBId) {
    throw new LegacyPlanTransitionConflictError();
  }

  const pair = canonicalPair(snapshot.userAId, snapshot.userBId);
  if (
    options.actorId &&
    options.actorId !== pair.minUserId &&
    options.actorId !== pair.maxUserId
  ) {
    throw new LegacyPlanTransitionConflictError();
  }
  if (
    options.expectedPeerId &&
    options.expectedPeerId !== pair.minUserId &&
    options.expectedPeerId !== pair.maxUserId
  ) {
    throw new LegacyPlanTransitionConflictError();
  }
  if (options.actorId && options.expectedPeerId) {
    if (options.actorId === options.expectedPeerId) {
      throw new LegacyPlanTransitionConflictError();
    }
    const expected = canonicalPair(options.actorId, options.expectedPeerId);
    if (
      expected.minUserId !== pair.minUserId ||
      expected.maxUserId !== pair.maxUserId
    ) {
      throw new LegacyPlanTransitionConflictError();
    }
  }
  if (options.expectedParticipantIds) {
    if (options.expectedParticipantIds[0] === options.expectedParticipantIds[1]) {
      throw new LegacyPlanTransitionConflictError();
    }
    const expected = canonicalPair(
      options.expectedParticipantIds[0],
      options.expectedParticipantIds[1],
    );
    if (
      expected.minUserId !== pair.minUserId ||
      expected.maxUserId !== pair.maxUserId
    ) {
      throw new LegacyPlanTransitionConflictError();
    }
  }

  await userConnectionSafetyLocks(tx, [pair.minUserId, pair.maxUserId]);
  await pairSafetyLock(tx, pair.minUserId, pair.maxUserId);

  // Both Block installation and user-global moderation installation own the
  // same advisory locks, so this post-lock read is the linearization barrier.
  const [peerBlock, moderationBlock] = await Promise.all([
    tx.block.findFirst({
      where: {
        OR: [
          { blockerId: pair.minUserId, blockedId: pair.maxUserId },
          { blockerId: pair.maxUserId, blockedId: pair.minUserId },
        ],
      },
      select: { id: true },
    }),
    tx.moderationBlock.findFirst({
      where: {
        userId: { in: [pair.minUserId, pair.maxUserId] },
        isActive: true,
      },
      select: { id: true },
    }),
  ]);
  if (peerBlock || moderationBlock) {
    throw new LegacyPlanTransitionConflictError();
  }

  const rows = await tx.$queryRaw<LockedLegacyPlanConnection[]>(Prisma.sql`
    SELECT "id", "userAId", "userBId", "status"
    FROM "Connection"
    WHERE "id" = ${options.connectionId}
    FOR UPDATE
  `);
  const connection = rows[0];
  if (!connection || connection.userAId === connection.userBId) {
    throw new LegacyPlanTransitionConflictError();
  }
  const lockedPair = canonicalPair(connection.userAId, connection.userBId);
  if (
    lockedPair.minUserId !== pair.minUserId ||
    lockedPair.maxUserId !== pair.maxUserId ||
    connection.status === "BLOCKED" ||
    (!options.allowEnded && connection.status !== "ACTIVE")
  ) {
    throw new LegacyPlanTransitionConflictError();
  }
  return Object.freeze(connection);
}

function isSamePair(
  commitment: Pick<
    NonNullable<LockedTransition["commitment"]>,
    "participantAId" | "participantBId"
  >,
  revision: Pick<PlanRequest, "proposerUserId" | "receiverUserId">,
): boolean {
  return (
    (commitment.participantAId === revision.proposerUserId &&
      commitment.participantBId === revision.receiverUserId) ||
    (commitment.participantAId === revision.receiverUserId &&
      commitment.participantBId === revision.proposerUserId)
  );
}

/**
 * DB-05 backfilled revisions participate in a stable Commitment. Read the
 * nullable compatibility key first, then take locks in the global narrow
 * order Commitment -> PlanRequest. Rows that remain unbound retain the exact
 * legacy single-row transition.
 */
async function lockActionableRevision(
  tx: DbClient,
  planRequestId: string,
  afterConnectionSafety?: () => Promise<void>,
): Promise<LockedTransition> {
  const snapshot = await tx.planRequest.findUnique({
    where: { id: planRequestId },
    select: {
      commitmentId: true,
      connectionId: true,
      proposerUserId: true,
      receiverUserId: true,
      originAction: {
        select: { coordinationPolicy: true },
      },
      actionInterest: {
        select: {
          classmatePost: { select: { coordinationPolicy: true } },
        },
      },
    },
  });
  if (!snapshot) throw new LegacyPlanTransitionConflictError();

  await lockLegacyPlanConnectionSafety(tx, {
    connectionId: snapshot.connectionId,
    expectedParticipantIds: [
      snapshot.proposerUserId,
      snapshot.receiverUserId,
    ],
  });

  const trustedPolicies = [
    snapshot.originAction?.coordinationPolicy,
    snapshot.actionInterest?.classmatePost.coordinationPolicy,
  ];
  if (trustedPolicies.includes("CREATOR_GATED_V2")) {
    throw new LegacyPlanPolicyUnsupportedError(
      snapshot.commitmentId
        ? {
            action: "OPEN_PLAN",
            focus: {
              type: "PLAN",
              connectionId: snapshot.connectionId,
              commitmentId: snapshot.commitmentId,
              revisionId: planRequestId,
            },
          }
        : null,
    );
  }
  await afterConnectionSafety?.();

  let commitment: LockedTransition["commitment"] = null;
  if (snapshot.commitmentId) {
    const lockedCommitment = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "PlanCommitment"
      WHERE "id" = ${snapshot.commitmentId}
      FOR UPDATE
    `);
    if (lockedCommitment.length !== 1) {
      throw new LegacyPlanTransitionConflictError();
    }
    commitment = await tx.planCommitment.findUnique({
      where: { id: snapshot.commitmentId },
      select: {
        id: true,
        connectionId: true,
        participantAId: true,
        participantBId: true,
        status: true,
        currentAcceptedRevisionId: true,
        currentPendingRevisionId: true,
        safetyRestrictedAt: true,
      },
    });
    if (!commitment || commitment.safetyRestrictedAt) {
      throw new LegacyPlanTransitionConflictError();
    }

    // A RESCHEDULE owns both an accepted and a pending revision. Lock both in
    // immutable ID order after the Commitment so concurrent lifecycle paths
    // cannot invert PlanRequest row locks.
    const revisionIds = [
      ...new Set(
        [planRequestId, commitment.currentAcceptedRevisionId].filter(
          (id): id is string => id !== null,
        ),
      ),
    ].sort();
    for (const revisionId of revisionIds) {
      const lockedRevision = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
        SELECT "id"
        FROM "PlanRequest"
        WHERE "id" = ${revisionId}
        FOR UPDATE
      `);
      if (lockedRevision.length !== 1) {
        throw new LegacyPlanTransitionConflictError();
      }
    }
  } else {
    const lockedRevision = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id"
      FROM "PlanRequest"
      WHERE "id" = ${planRequestId}
      FOR UPDATE
    `);
    if (lockedRevision.length !== 1) {
      throw new LegacyPlanTransitionConflictError();
    }
  }

  const revision = await tx.planRequest.findUnique({
    where: { id: planRequestId },
  });
  if (
    !revision ||
    revision.status !== "PENDING" ||
    revision.commitmentId !== snapshot.commitmentId ||
    revision.connectionId !== snapshot.connectionId ||
    revision.proposerUserId !== snapshot.proposerUserId ||
    revision.receiverUserId !== snapshot.receiverUserId
  ) {
    throw new LegacyPlanTransitionConflictError();
  }

  if (!revision.commitmentId) {
    return { revision, commitment: null };
  }

  if (
    !commitment ||
    !revision.revisionKind ||
    commitment.connectionId !== revision.connectionId ||
    !isSamePair(commitment, revision) ||
    commitment.currentPendingRevisionId !== revision.id
  ) {
    throw new LegacyPlanTransitionConflictError();
  }

  if (
    (revision.revisionKind === "INITIAL" &&
      (commitment.status !== "NEGOTIATING" ||
        commitment.currentAcceptedRevisionId !== null)) ||
    (revision.revisionKind === "RESCHEDULE" &&
      (commitment.status !== "CONFIRMED" ||
        commitment.currentAcceptedRevisionId === null))
  ) {
    throw new LegacyPlanTransitionConflictError();
  }

  if (revision.revisionKind === "RESCHEDULE") {
    const accepted = await tx.planRequest.findUnique({
      where: { id: commitment.currentAcceptedRevisionId! },
      select: { commitmentId: true, status: true, endTime: true },
    });
    const [clock] = await tx.$queryRaw<Array<{ databaseNow: Date }>>`
      SELECT clock_timestamp() AS "databaseNow"
    `;
    if (
      !accepted ||
      !clock ||
      accepted.commitmentId !== commitment.id ||
      accepted.status !== "ACCEPTED" ||
      accepted.endTime <= clock.databaseNow
    ) {
      throw new LegacyPlanTransitionConflictError(
        "A completed Plan can no longer be rescheduled.",
      );
    }
  }

  return { revision, commitment };
}

export async function acceptLegacyPlanRevision(
  tx: DbClient,
  planRequestId: string,
  options?: Readonly<{ afterConnectionSafety?: () => Promise<void> }>,
): Promise<Readonly<{ revision: PlanRequest; planCommitmentId: string | null }>> {
  const locked = await lockActionableRevision(
    tx,
    planRequestId,
    options?.afterConnectionSafety,
  );
  const revision = await tx.planRequest.update({
    where: { id: locked.revision.id },
    data: { status: "ACCEPTED" },
  });

  if (locked.commitment) {
    if (locked.revision.revisionKind === "INITIAL") {
      await tx.$executeRaw`
        UPDATE "PlanCommitment"
        SET
          "status" = 'CONFIRMED',
          "currentAcceptedRevisionId" = ${revision.id},
          "currentPendingRevisionId" = NULL,
          "confirmedAt" = COALESCE("confirmedAt", clock_timestamp()),
          "updatedAt" = clock_timestamp()
        WHERE "id" = ${locked.commitment.id}
      `;
    } else {
      await tx.planCommitment.update({
        where: { id: locked.commitment.id },
        data: {
          status: "CONFIRMED",
          currentAcceptedRevisionId: revision.id,
          currentPendingRevisionId: null,
        },
      });
    }
  }

  return {
    revision,
    planCommitmentId: locked.commitment?.id ?? null,
  };
}

export async function declineLegacyPlanRevision(
  tx: DbClient,
  planRequestId: string,
): Promise<Readonly<{ revision: PlanRequest; planCommitmentId: string | null }>> {
  const locked = await lockActionableRevision(tx, planRequestId);
  const revision = await tx.planRequest.update({
    where: { id: locked.revision.id },
    data: { status: "DECLINED" },
  });

  if (locked.commitment) {
    await tx.planCommitment.update({
      where: { id: locked.commitment.id },
      data: {
        status:
          locked.revision.revisionKind === "INITIAL" ? "CLOSED" : "CONFIRMED",
        currentPendingRevisionId: null,
      },
    });
  }

  return {
    revision,
    planCommitmentId: locked.commitment?.id ?? null,
  };
}

export async function counterLegacyPlanRevision<T extends { id: string }>(
  tx: DbClient,
  options: {
    planRequestId: string;
    createCounter: (
      inheritance: StableCounterInheritance | null,
    ) => Promise<T>;
    afterConnectionSafety?: () => Promise<void>;
  },
): Promise<T> {
  const locked = await lockActionableRevision(
    tx,
    options.planRequestId,
    options.afterConnectionSafety,
  );
  await tx.planRequest.update({
    where: { id: locked.revision.id },
    data: { status: "COUNTER_PROPOSED" },
  });

  const stableInheritance = locked.commitment
    ? {
        actionInterestId: locked.revision.actionInterestId,
        commitmentId: locked.commitment.id,
        revisionKind: locked.revision.revisionKind!,
        originActionId: locked.revision.originActionId,
        originContextId: locked.revision.originContextId,
        originKind: locked.revision.originKind,
        originId: locked.revision.originId,
        ...(locked.revision.originSnapshot !== null
          ? {
              originSnapshot: locked.revision
                .originSnapshot as Prisma.InputJsonValue,
            }
          : {}),
      }
    : null;
  const counter = await options.createCounter(stableInheritance);

  if (locked.commitment) {
    const created = await tx.planRequest.findUnique({
      where: { id: counter.id },
      select: {
        commitmentId: true,
        revisionKind: true,
        counterOfId: true,
        status: true,
      },
    });
    if (
      !created ||
      created.commitmentId !== locked.commitment.id ||
      created.revisionKind !== locked.revision.revisionKind ||
      created.counterOfId !== locked.revision.id ||
      created.status !== "PENDING"
    ) {
      throw new LegacyPlanTransitionConflictError(
        "The counter proposal did not preserve its Plan commitment.",
      );
    }
    await tx.planCommitment.update({
      where: { id: locked.commitment.id },
      data: { currentPendingRevisionId: counter.id },
    });
  }

  return counter;
}

export async function upsertLegacyPlanOutcome(
  tx: DbClient,
  options: {
    planId: string;
    userId: string;
    value: PlanOutcomeValue;
  },
) {
  const snapshot = await tx.planRequest.findUnique({
    where: { id: options.planId },
    select: {
      commitmentId: true,
      connectionId: true,
      proposerUserId: true,
      receiverUserId: true,
    },
  });
  if (!snapshot) throw new LegacyPlanTransitionConflictError();

  await lockLegacyPlanConnectionSafety(tx, {
    connectionId: snapshot.connectionId,
    expectedParticipantIds: [
      snapshot.proposerUserId,
      snapshot.receiverUserId,
    ],
    allowEnded: true,
  });

  if (!snapshot.commitmentId) {
    const response = await tx.planOutcomeResponse.upsert({
      where: {
        planId_userId: { planId: options.planId, userId: options.userId },
      },
      create: {
        planId: options.planId,
        userId: options.userId,
        value: options.value,
      },
      update: { value: options.value },
    });
    await syncSharedEncounter(tx, {
      planId: options.planId,
      planCommitmentId: null,
      participantAId: snapshot.proposerUserId,
      participantBId: snapshot.receiverUserId,
    });
    return response;
  }

  const lockedCommitment = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "PlanCommitment"
    WHERE "id" = ${snapshot.commitmentId}
    FOR UPDATE
  `;
  const lockedPlan = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT "id"
    FROM "PlanRequest"
    WHERE "id" = ${options.planId}
    FOR UPDATE
  `;
  if (lockedCommitment.length !== 1 || lockedPlan.length !== 1) {
    throw new LegacyPlanTransitionConflictError();
  }
  const [commitment, plan] = await Promise.all([
    tx.planCommitment.findUnique({
      where: { id: snapshot.commitmentId },
      select: {
        id: true,
        participantAId: true,
        participantBId: true,
        status: true,
        currentAcceptedRevisionId: true,
        safetyRestrictedAt: true,
      },
    }),
    tx.planRequest.findUnique({
      where: { id: options.planId },
      select: {
        id: true,
        commitmentId: true,
        proposerUserId: true,
        receiverUserId: true,
        status: true,
      },
    }),
  ]);
  if (
    !commitment ||
    !plan ||
    plan.commitmentId !== commitment.id ||
    plan.status !== "ACCEPTED" ||
    commitment.status !== "CONFIRMED" ||
    commitment.currentAcceptedRevisionId !== plan.id ||
    commitment.safetyRestrictedAt !== null ||
    !isSamePair(commitment, plan) ||
    (options.userId !== commitment.participantAId &&
      options.userId !== commitment.participantBId)
  ) {
    throw new LegacyPlanTransitionConflictError(
      "Outcome feedback is only available for the current accepted Plan.",
    );
  }

  const response = await tx.planOutcomeResponse.upsert({
    where: {
      planCommitmentId_userId: {
        planCommitmentId: commitment.id,
        userId: options.userId,
      },
    },
    create: {
      planId: plan.id,
      planCommitmentId: commitment.id,
      userId: options.userId,
      value: options.value,
    },
    update: {
      planId: plan.id,
      planCommitmentId: commitment.id,
      value: options.value,
    },
  });
  await syncSharedEncounter(tx, {
    planId: plan.id,
    planCommitmentId: commitment.id,
    participantAId: commitment.participantAId,
    participantBId: commitment.participantBId,
  });
  return response;
}
