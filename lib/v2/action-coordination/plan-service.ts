import "server-only";

import {
  type ActionInterestSurface,
  type ClassmatePostCategory,
  type ExperimentVariant,
  type PlanRequestStatus,
  type PlanType,
  Prisma,
  type PrismaClient,
  type ProductFunnelSourceKind,
} from "@prisma/client";

import {
  assertDirectUnrepliedSendAllowed,
  completeDirectReplyGateAfterSend,
  PeerReplyRequiredError,
} from "@/lib/chat/direct-message-service";
import { prisma } from "@/lib/db/prisma";
import { materializePlanCalendarEntries } from "@/lib/queries/chat-planning";
import { parseActionOriginSnapshot } from "@/lib/v2/action-context-snapshot";
import {
  runAtomicActionCoordinationCommand,
  type ActionCoordinationAtomicCommandResult,
  type ActionCoordinationClock,
  type ActionCoordinationReplayResponse,
  type ActionCoordinationTransactionContext,
  type ActionCoordinationTransactionOptions,
} from "@/lib/v2/action-coordination/command";
import type {
  ActionCoordinationJsonObject,
  PlanRouteFocus,
} from "@/lib/v2/action-coordination/dto";
import {
  canonicalPairResourceId,
  stableCanonicalPairs,
  type CanonicalUserPair,
  type UserPairInput,
} from "@/lib/v2/action-coordination/db-locks";
import {
  ActionCoordinationConflict,
  ActionCoordinationFailure,
  safetyUnavailable,
} from "@/lib/v2/action-coordination/errors";
import { actionPolicyTupleKind } from "@/lib/v2/action-coordination/policy-snapshot";
import { actionCoordinationFailureResult } from "@/lib/v2/action-coordination/route-adapter";
import {
  finalizeActionExpiry,
  snapshotActionExpiryPairs,
  type ActionLifecycleFinalizerDependencies,
} from "@/lib/v2/action-lifecycle-finalizer";
import {
  businessFunnelEventKeys,
  recordServerFunnelEvent,
} from "@/lib/v2/funnel-events";
import {
  enqueueNotificationOutboxItem,
  notificationOutboxSourceKeys,
} from "@/lib/v2/notification-outbox-producer";
import {
  finalizeStablePlanCommitment,
  finalizeStablePlanLifecycleInTransaction,
  type PlanLifecycleFinalizerDependencies,
} from "@/lib/v2/plan-lifecycle-finalizer";

const MINIMUM_PLAN_DURATION_MS = 30 * 60_000;
const MAX_ACTION_PAIR_SNAPSHOT_ATTEMPTS = 3;

export type InitialActionPlanInput = Readonly<{
  planType: PlanType;
  title: string;
  location?: string | null;
  message?: string | null;
  startTime: string;
  endTime: string;
}>;

export type NormalizedActionPlanInput = Readonly<{
  planType: PlanType;
  title: string;
  location: string | null;
  message: string | null;
  startTime: string;
  endTime: string;
}>;

export type ActionPlanEnvelopeDTO = ActionCoordinationJsonObject & {
  plan: ActionCoordinationJsonObject & {
    commitmentId: string;
    revisionId: string;
    connectionId: string;
    commitmentStatus: "NEGOTIATING" | "CONFIRMED" | "CLOSED";
    revisionStatus: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELED";
    focus: PlanRouteFocus;
  };
};

export type ActionPlanMutationResult =
  ActionCoordinationAtomicCommandResult<ActionPlanEnvelopeDTO>;

type PlanServiceDatabase = PrismaClient;

export type ActionPlanServiceDependencies = Readonly<{
  db?: PlanServiceDatabase;
  clock?: ActionCoordinationClock;
  transactionOptions?: ActionCoordinationTransactionOptions;
  finalizeActionExpiry?: (
    actionId: string,
    dependencies: ActionLifecycleFinalizerDependencies,
  ) => ReturnType<typeof finalizeActionExpiry>;
  finalizePlanCommitment?: (
    commitmentId: string,
    dependencies: PlanLifecycleFinalizerDependencies,
  ) => ReturnType<typeof finalizeStablePlanCommitment>;
}>;

export type InitialActionPlanTransactionResource = Readonly<{
  actionId: string;
  interestId: string;
  contextId: string;
  connectionId: string;
  creatorId: string;
  responderId: string;
  pair: readonly [string, string];
}>;

type DiscoveredContextResource = InitialActionPlanTransactionResource;

type DiscoveredRevisionResource = DiscoveredContextResource &
  Readonly<{
    commitmentId: string;
    revisionId: string;
  }>;

const planContextSelect = Prisma.validator<Prisma.ActionCoordinationContextSelect>()({
  id: true,
  state: true,
  reservationId: true,
  reservationGeneration: true,
  leaseExpiresAt: true,
  connectionId: true,
  activatedAt: true,
  firstCounterpartResponseAt: true,
  currentActivationId: true,
  currentActivation: {
    select: {
      id: true,
      interestId: true,
      interestSurface: true,
      connectedAt: true,
      firstContentType: true,
      terminalReason: true,
    },
  },
  interest: {
    select: {
      id: true,
      userId: true,
      connectionId: true,
      status: true,
      originSnapshot: true,
      classmatePostId: true,
      classmatePost: {
        select: {
          id: true,
          userId: true,
          category: true,
          status: true,
          expiresAt: true,
          fulfilledByPlanId: true,
          coordinationPolicy: true,
          policySchemaVersion: true,
          policyParametersSnapshot: true,
          experimentKeySnapshot: true,
          experimentVariantSnapshot: true,
          clientCapabilitySnapshot: true,
          policySnapshottedAt: true,
        },
      },
    },
  },
});

type LockedPlanContext = Prisma.ActionCoordinationContextGetPayload<{
  select: typeof planContextSelect;
}>;

type LockedActionContextRow = Readonly<{
  interestId: string;
  responderId: string;
  contextId: string;
  contextState: "WAITING" | "INITIATING" | "OPEN" | "ENDED" | "UNAVAILABLE";
  reservationGeneration: number;
  activationId: string;
  activationConnectedAt: Date | null;
  activationTerminalReason:
    | "ACTION_FULFILLED_BEFORE_CONNECT"
    | "ACTION_EXPIRED_BEFORE_CONNECT"
    | "INTEREST_WITHDRAWN_BEFORE_CONNECT"
    | "SAFETY_UNAVAILABLE_BEFORE_CONNECT"
    | null;
  interestSurface: ActionInterestSurface;
  connectionId: string | null;
}>;

type LockedCommitment = Readonly<{
  id: string;
  connectionId: string;
  participantAId: string;
  participantBId: string;
  originActionId: string | null;
  originContextId: string | null;
  status: "NEGOTIATING" | "CONFIRMED" | "CLOSED" | "CANCELED";
  currentAcceptedRevisionId: string | null;
  currentPendingRevisionId: string | null;
  safetyRestrictedAt: Date | null;
}>;

type LockedRevision = Readonly<{
  id: string;
  connectionId: string;
  actionInterestId: string | null;
  commitmentId: string | null;
  revisionKind: "INITIAL" | "RESCHEDULE" | null;
  originActionId: string | null;
  originContextId: string | null;
  originKind:
    | "ACTION_INTEREST"
    | "MUTUAL_OPPORTUNITY"
    | "CLASSMATE_POST"
    | "DISCOVER_ACTIVITY"
    | "AVAILABILITY_SHARE"
    | "SCHEDULE_SHARE"
    | "SMALL_GROUP"
    | null;
  originId: string | null;
  originSnapshot: Prisma.JsonValue | null;
  proposerUserId: string;
  receiverUserId: string;
  planType: PlanType;
  title: string;
  location: string | null;
  message: string | null;
  startTime: Date;
  endTime: Date;
  status: PlanRequestStatus;
}>;

class ChangedFulfillmentPairSnapshotError extends Error {
  constructor(readonly actionId: string) {
    super(`Action ${actionId} gained an affected pair after fulfillment snapshot.`);
    this.name = "ChangedFulfillmentPairSnapshotError";
  }
}

function database(dependencies: ActionPlanServiceDependencies): PlanServiceDatabase {
  return dependencies.db ?? prisma;
}

function normalizePlanInput(input: InitialActionPlanInput): NormalizedActionPlanInput {
  const title = input.title.trim();
  const location = input.location?.trim() || null;
  const message = input.message?.trim() || null;
  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  if (
    !new Set<PlanType>(["STUDY", "MEAL", "SPORTS", "LANGUAGE", "CUSTOM"]).has(
      input.planType,
    ) ||
    title.length < 1 ||
    title.length > 120 ||
    (location?.length ?? 0) > 120 ||
    (message?.length ?? 0) > 500 ||
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end.getTime() <= start.getTime() ||
    end.getTime() - start.getTime() < MINIMUM_PLAN_DURATION_MS
  ) {
    throw new ActionCoordinationFailure(
      "PLAN_TIME_INVALID",
      "Choose a valid Plan of at least 30 minutes.",
      422,
    );
  }
  return Object.freeze({
    planType: input.planType,
    title,
    location,
    message,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  });
}

function requireFuturePlan(input: NormalizedActionPlanInput, now: Date): void {
  if (new Date(input.startTime).getTime() <= now.getTime()) {
    throw new ActionCoordinationFailure(
      "PLAN_TIME_PASSED",
      "Choose a Plan time in the future.",
      409,
    );
  }
}

function planFocus(options: {
  connectionId: string;
  commitmentId: string;
  revisionId?: string;
}): PlanRouteFocus {
  return options.revisionId
    ? {
        type: "PLAN",
        connectionId: options.connectionId,
        commitmentId: options.commitmentId,
        revisionId: options.revisionId,
      }
    : {
        type: "PLAN",
        connectionId: options.connectionId,
        commitmentId: options.commitmentId,
      };
}

function envelope(options: {
  commitmentId: string;
  revisionId: string;
  connectionId: string;
  commitmentStatus: "NEGOTIATING" | "CONFIRMED" | "CLOSED";
  revisionStatus: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELED";
}): ActionPlanEnvelopeDTO {
  return {
    plan: {
      ...options,
      focus: planFocus(options),
    },
  };
}

function planRecoveryConflict(options: {
  code: "ACTION_FULFILLED" | "ACTION_PLAN_PENDING" | "CONTEXT_PLAN_PENDING" | "PLAN_CHANGE_PENDING";
  message: string;
  actionId?: string;
  connectionId: string;
  commitmentId: string;
  revisionId?: string;
  commitmentStatus?: string;
  revisionStatus?: string;
}): never {
  throw new ActionCoordinationConflict(
    options.code,
    options.message,
    {
      ...(options.actionId ? { actionId: options.actionId } : {}),
      commitmentId: options.commitmentId,
      ...(options.revisionId ? { revisionId: options.revisionId } : {}),
      ...(options.commitmentStatus
        ? { commitmentStatus: options.commitmentStatus }
        : {}),
      ...(options.revisionStatus ? { revisionStatus: options.revisionStatus } : {}),
    },
    {
      action: "OPEN_PLAN",
      focus: planFocus(options),
    },
  );
}

async function throwActionFulfilledForActor(options: {
  tx: Prisma.TransactionClient;
  actorId: string;
  actionId: string;
  commitmentId: string;
}): Promise<never> {
  const winning = await options.tx.planCommitment.findFirst({
    where: {
      id: options.commitmentId,
      originActionId: options.actionId,
    },
    select: {
      id: true,
      connectionId: true,
      participantAId: true,
      participantBId: true,
      status: true,
      safetyRestrictedAt: true,
      currentPendingRevision: {
        select: { id: true, status: true },
      },
      currentAcceptedRevision: {
        select: { id: true, status: true },
      },
    },
  });
  const actorIsParticipant =
    winning?.participantAId === options.actorId ||
    winning?.participantBId === options.actorId;

  // An Action's terminal state is safe to reveal, but the winning pair and
  // Plan identities are not. Only a participant in the winning Commitment may
  // receive an exact route back to that Plan.
  if (!winning || !actorIsParticipant || winning.safetyRestrictedAt !== null) {
    throw new ActionCoordinationFailure(
      "ACTION_FULFILLED",
      "This Action already formed a Plan.",
      409,
    );
  }

  const currentRevision =
    winning.currentPendingRevision ?? winning.currentAcceptedRevision;
  planRecoveryConflict({
    code: "ACTION_FULFILLED",
    message: "This Action already formed a Plan.",
    actionId: options.actionId,
    connectionId: winning.connectionId,
    commitmentId: winning.id,
    ...(currentRevision ? { revisionId: currentRevision.id } : {}),
    commitmentStatus: winning.status,
    ...(currentRevision ? { revisionStatus: currentRevision.status } : {}),
  });
}

async function throwActionPlanPendingForActor(options: {
  actorId: string;
  actionId: string;
  requestedConnectionId: string;
  pending: Readonly<{
    id: string;
    connectionId: string;
    participantAId: string;
    participantBId: string;
    status: "NEGOTIATING" | "CONFIRMED" | "CLOSED" | "CANCELED";
    currentPendingRevisionId: string;
    safetyRestrictedAt: Date | null;
  }>;
}): Promise<never> {
  const actorIsParticipant =
    options.pending.participantAId === options.actorId ||
    options.pending.participantBId === options.actorId;
  if (!actorIsParticipant || options.pending.safetyRestrictedAt !== null) {
    throw new ActionCoordinationFailure(
      "ACTION_PLAN_PENDING",
      "Resolve the current Action Plan before proposing another.",
      409,
    );
  }
  planRecoveryConflict({
    code:
      options.pending.connectionId === options.requestedConnectionId
        ? "CONTEXT_PLAN_PENDING"
        : "ACTION_PLAN_PENDING",
    message: "Resolve the current Action Plan before proposing another.",
    actionId: options.actionId,
    connectionId: options.pending.connectionId,
    commitmentId: options.pending.id,
    revisionId: options.pending.currentPendingRevisionId,
    commitmentStatus: options.pending.status,
    revisionStatus: "PENDING",
  });
}

function mutationRequest(options: {
  actorId: string;
  idempotencyKey: string;
  method: "POST" | "DELETE";
  operationId: string;
  resourceKind: "ACTION_CONTEXT" | "PLAN_REVISION";
  resourceId: string;
  body: ActionCoordinationJsonObject | null;
}) {
  const pathParameters: ActionCoordinationJsonObject =
    options.resourceKind === "ACTION_CONTEXT"
      ? { contextId: options.resourceId }
      : { revisionId: options.resourceId };
  return {
    actorId: options.actorId,
    idempotencyKey: options.idempotencyKey,
    operation: { method: options.method, operationId: options.operationId },
    canonicalResource: {
      kind: options.resourceKind,
      id: options.resourceId,
    },
    pathParameters,
    body: options.body,
  } as const;
}

function sourceKind(category: ClassmatePostCategory): ProductFunnelSourceKind {
  return category === "SHARED_COURSES" ? "COURSE_ACTION" : "BUDDY_POST";
}

function funnelSurface(surface: ActionInterestSurface) {
  return surface === "FEED_CARD" ? "DISCOVER_EXPLORE" : "ACTION_DETAIL";
}

function attribution(action: {
  coordinationPolicy: "DIRECT_CONVERSATION_V1" | "CREATOR_GATED_V2" | null;
  policySchemaVersion: number | null;
  experimentKeySnapshot: string | null;
  experimentVariantSnapshot: ExperimentVariant | null;
}) {
  return {
    ...(action.coordinationPolicy
      ? { coordinationPolicy: action.coordinationPolicy }
      : {}),
    ...(action.policySchemaVersion
      ? { policySchemaVersion: action.policySchemaVersion }
      : {}),
    ...(action.experimentKeySnapshot && action.experimentVariantSnapshot
      ? {
          experimentKey: action.experimentKeySnapshot,
          experimentVariant: action.experimentVariantSnapshot,
        }
      : {}),
  };
}

async function discoverContextResource(
  db: PlanServiceDatabase,
  contextId: string,
  actorId: string,
): Promise<DiscoveredContextResource | null> {
  const context = await db.actionCoordinationContext.findUnique({
    where: { id: contextId },
    select: {
      id: true,
      connectionId: true,
      interest: {
        select: {
          id: true,
          userId: true,
          classmatePostId: true,
          classmatePost: { select: { userId: true } },
        },
      },
    },
  });
  if (!context?.connectionId) return null;
  const creatorId = context.interest.classmatePost.userId;
  const responderId = context.interest.userId;
  if (
    creatorId === responderId ||
    (actorId !== creatorId && actorId !== responderId)
  ) {
    throw safetyUnavailable(404);
  }
  return Object.freeze({
    actionId: context.interest.classmatePostId,
    interestId: context.interest.id,
    contextId: context.id,
    connectionId: context.connectionId,
    creatorId,
    responderId,
    pair: [creatorId, responderId] as const,
  });
}

async function discoverRevisionResource(
  db: PlanServiceDatabase,
  revisionId: string,
  actorId: string,
): Promise<DiscoveredRevisionResource | null> {
  const revision = await db.planRequest.findUnique({
    where: { id: revisionId },
    select: {
      id: true,
      commitmentId: true,
      originActionId: true,
      originContextId: true,
      commitment: {
        select: {
          id: true,
          connectionId: true,
          participantAId: true,
          participantBId: true,
        },
      },
      originContext: {
        select: {
          id: true,
          interestId: true,
          interest: {
            select: {
              userId: true,
              classmatePostId: true,
              classmatePost: { select: { userId: true } },
            },
          },
        },
      },
    },
  });
  const commitment = revision?.commitment;
  const originContext = revision?.originContext;
  if (
    !revision ||
    !revision.commitmentId ||
    !revision.originActionId ||
    !revision.originContextId ||
    !commitment ||
    !originContext ||
    originContext.id !== revision.originContextId ||
    originContext.interest.classmatePostId !== revision.originActionId
  ) {
    return null;
  }
  const creatorId = originContext.interest.classmatePost.userId;
  const responderId = originContext.interest.userId;
  const participants = new Set([
    commitment.participantAId,
    commitment.participantBId,
  ]);
  if (
    creatorId === responderId ||
    participants.size !== 2 ||
    !participants.has(creatorId) ||
    !participants.has(responderId) ||
    !participants.has(actorId)
  ) {
    throw safetyUnavailable(404);
  }
  return Object.freeze({
    actionId: revision.originActionId,
    interestId: originContext.interestId,
    contextId: originContext.id,
    connectionId: commitment.connectionId,
    creatorId,
    responderId,
    pair: [creatorId, responderId] as const,
    commitmentId: commitment.id,
    revisionId: revision.id,
  });
}

async function runPlanPreflights(options: {
  db: PlanServiceDatabase;
  actionId: string;
  commitmentId?: string | null;
  dependencies: ActionPlanServiceDependencies;
}): Promise<void> {
  let commitmentId = options.commitmentId ?? null;
  if (!commitmentId) {
    commitmentId =
      (
        await options.db.planCommitment.findFirst({
          where: {
            originActionId: options.actionId,
            currentPendingRevisionId: { not: null },
            status: { in: ["NEGOTIATING", "CONFIRMED"] },
          },
          select: { id: true },
          orderBy: { id: "asc" },
        })
      )?.id ?? null;
  }
  if (commitmentId) {
    await (
      options.dependencies.finalizePlanCommitment ??
      finalizeStablePlanCommitment
    )(commitmentId, {
      db: options.db,
      clock: options.dependencies.clock,
      transactionOptions: options.dependencies.transactionOptions,
    });
  }
  await (options.dependencies.finalizeActionExpiry ?? finalizeActionExpiry)(
    options.actionId,
    {
      db: options.db,
      clock: options.dependencies.clock,
      transactionOptions: options.dependencies.transactionOptions,
    },
  );
}

async function lockAction(
  tx: Prisma.TransactionClient,
  actionId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ClassmatePost"
    WHERE "id" = ${actionId}
    FOR UPDATE
  `);
  if (!rows[0]) throw safetyUnavailable(404);
}

async function lockContextGraph(
  tx: Prisma.TransactionClient,
  resource: DiscoveredContextResource,
): Promise<LockedPlanContext> {
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ActionInterest"
    WHERE "id" = ${resource.interestId}
    ORDER BY "id"
    FOR UPDATE
  `);
  await tx.$queryRaw<Array<{ contextId: string; activationId: string }>>(
    Prisma.sql`
      SELECT context."id" AS "contextId", activation."id" AS "activationId"
      FROM "ActionCoordinationContext" context
      INNER JOIN "ActionInterestActivation" activation
        ON activation."id" = context."currentActivationId"
      WHERE context."id" = ${resource.contextId}
      ORDER BY activation."id", context."id"
      FOR UPDATE OF activation, context
    `,
  );
  const graph = await tx.actionCoordinationContext.findUnique({
    where: { id: resource.contextId },
    select: planContextSelect,
  });
  if (
    !graph ||
    graph.interest.id !== resource.interestId ||
    graph.interest.classmatePostId !== resource.actionId ||
    graph.interest.userId !== resource.responderId ||
    graph.interest.classmatePost.userId !== resource.creatorId
  ) {
    throw safetyUnavailable(404);
  }
  return graph;
}

async function lockConnection(
  tx: Prisma.TransactionClient,
  resource: Pick<
    DiscoveredContextResource,
    "connectionId" | "creatorId" | "responderId"
  >,
) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "Connection"
    WHERE "id" = ${resource.connectionId}
    FOR UPDATE
  `);
  if (!rows[0]) throw safetyUnavailable(404);
  const connection = await tx.connection.findUnique({
    where: { id: resource.connectionId },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      status: true,
    },
  });
  const pair = new Set([connection?.userAId, connection?.userBId]);
  if (
    !connection ||
    connection.status !== "ACTIVE" ||
    pair.size !== 2 ||
    !pair.has(resource.creatorId) ||
    !pair.has(resource.responderId)
  ) {
    throw safetyUnavailable(404);
  }
  return connection;
}

async function lockCommitment(
  tx: Prisma.TransactionClient,
  commitmentId: string,
): Promise<LockedCommitment> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "PlanCommitment"
    WHERE "id" = ${commitmentId}
    FOR UPDATE
  `);
  if (!rows[0]) throw safetyUnavailable(404);
  const commitment = await tx.planCommitment.findUnique({
    where: { id: commitmentId },
    select: {
      id: true,
      connectionId: true,
      participantAId: true,
      participantBId: true,
      originActionId: true,
      originContextId: true,
      status: true,
      currentAcceptedRevisionId: true,
      currentPendingRevisionId: true,
      safetyRestrictedAt: true,
    },
  });
  if (!commitment) throw safetyUnavailable(404);
  return commitment;
}

async function lockRevision(
  tx: Prisma.TransactionClient,
  revisionId: string,
): Promise<LockedRevision> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "PlanRequest"
    WHERE "id" = ${revisionId}
    FOR UPDATE
  `);
  if (!rows[0]) throw safetyUnavailable(404);
  const revision = await tx.planRequest.findUnique({
    where: { id: revisionId },
    select: {
      id: true,
      connectionId: true,
      actionInterestId: true,
      commitmentId: true,
      revisionKind: true,
      originActionId: true,
      originContextId: true,
      originKind: true,
      originId: true,
      originSnapshot: true,
      proposerUserId: true,
      receiverUserId: true,
      planType: true,
      title: true,
      location: true,
      message: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  });
  if (!revision) throw safetyUnavailable(404);
  return revision;
}

async function requirePairSafety(
  tx: Prisma.TransactionClient,
  creatorId: string,
  responderId: string,
): Promise<void> {
  const [block, moderation] = await Promise.all([
    tx.block.findFirst({
      where: {
        OR: [
          { blockerId: creatorId, blockedId: responderId },
          { blockerId: responderId, blockedId: creatorId },
        ],
      },
      select: { id: true },
    }),
    tx.moderationBlock.findFirst({
      where: {
        userId: { in: [creatorId, responderId] },
        isActive: true,
      },
      select: { id: true },
    }),
  ]);
  if (block || moderation) throw safetyUnavailable(404);
}

async function requirePlanSendAllowed(
  tx: Prisma.TransactionClient,
  connectionId: string,
  actorId: string,
) {
  try {
    return await assertDirectUnrepliedSendAllowed(tx, {
      connectionId,
      senderId: actorId,
    });
  } catch (cause) {
    if (cause instanceof PeerReplyRequiredError) {
      throw new ActionCoordinationFailure(
        "PEER_REPLY_REQUIRED",
        cause.message,
        403,
      );
    }
    throw cause;
  }
}

async function assertContextOrigin(
  tx: Prisma.TransactionClient,
  graph: LockedPlanContext,
  resource: DiscoveredContextResource,
  options: {
    actorId: string;
    allowInitiating: boolean;
    allowExpiredAction: boolean;
  },
): Promise<void> {
  const action = graph.interest.classmatePost;
  const activation = graph.currentActivation;
  const origin = parseActionOriginSnapshot(graph.interest.originSnapshot);
  const participantIds =
    origin?.kind === "LIVE" ? new Set(origin.snapshot.participantIds) : null;
  const validContextState = options.allowInitiating
    ? graph.state === "INITIATING"
    : graph.state === "OPEN";
  const validConnection = options.allowInitiating
    ? graph.connectionId === null && graph.interest.connectionId === null
    : graph.connectionId === resource.connectionId &&
      graph.interest.connectionId === resource.connectionId;
  const validActivation = options.allowInitiating
    ? activation?.connectedAt === null && activation?.firstContentType === null
    : activation?.connectedAt !== null && activation?.firstContentType !== null;
  if (
    actionPolicyTupleKind(action) !== "SNAPSHOTTED_CREATOR_GATED" ||
    graph.interest.status !== "ACTIVE" ||
    !activation ||
    graph.currentActivationId !== activation.id ||
    activation.interestId !== graph.interest.id ||
    activation.terminalReason !== null ||
    origin?.kind !== "LIVE" ||
    origin.snapshot.sourceId !== action.id ||
    participantIds?.size !== 2 ||
    !participantIds.has(resource.creatorId) ||
    !participantIds.has(resource.responderId)
  ) {
    throw safetyUnavailable(404);
  }
  if (action.status === "REMOVED") throw safetyUnavailable(404);
  if (action.status === "FULFILLED" || action.fulfilledByPlanId !== null) {
    if (action.fulfilledByPlanId) {
      await throwActionFulfilledForActor({
        tx,
        actorId: options.actorId,
        actionId: action.id,
        commitmentId: action.fulfilledByPlanId,
      });
    }
    throw new ActionCoordinationFailure(
      "ACTION_FULFILLED",
      "This Action already formed a Plan.",
      409,
    );
  }
  if (!validContextState || !validConnection || !validActivation) {
    throw safetyUnavailable(404);
  }
  if (
    action.status !== "ACTIVE" &&
    action.status !== "CLOSED" &&
    !(options.allowExpiredAction && action.status === "EXPIRED")
  ) {
    throw new ActionCoordinationFailure(
      "ACTION_EXPIRED",
      "This Action can no longer create a Plan.",
      409,
    );
  }
}

function assertCommitmentGraph(
  commitment: LockedCommitment,
  revision: LockedRevision,
  resource: DiscoveredRevisionResource,
): void {
  const participants = new Set([
    commitment.participantAId,
    commitment.participantBId,
  ]);
  const revisionOrigin = parseActionOriginSnapshot(revision.originSnapshot);
  const originParticipants =
    revisionOrigin?.kind === "LIVE"
      ? new Set(revisionOrigin.snapshot.participantIds)
      : null;
  if (
    commitment.id !== resource.commitmentId ||
    commitment.connectionId !== resource.connectionId ||
    commitment.originActionId !== resource.actionId ||
    commitment.originContextId !== resource.contextId ||
    commitment.safetyRestrictedAt !== null ||
    participants.size !== 2 ||
    !participants.has(resource.creatorId) ||
    !participants.has(resource.responderId) ||
    revision.id !== resource.revisionId ||
    revision.commitmentId !== commitment.id ||
    revision.connectionId !== commitment.connectionId ||
    revision.actionInterestId !== resource.interestId ||
    revision.originActionId !== resource.actionId ||
    revision.originContextId !== resource.contextId ||
    revision.originKind !== "ACTION_INTEREST" ||
    revision.originId !== resource.interestId ||
    revision.revisionKind !== "INITIAL" ||
    revisionOrigin?.kind !== "LIVE" ||
    revisionOrigin.snapshot.sourceId !== resource.actionId ||
    originParticipants?.size !== 2 ||
    !originParticipants.has(resource.creatorId) ||
    !originParticipants.has(resource.responderId)
  ) {
    throw safetyUnavailable(404);
  }
}

async function refreshPrivacySafePlanReplay(
  tx: Prisma.TransactionClient,
  replay: ActionCoordinationReplayResponse<ActionPlanEnvelopeDTO>,
  actorId: string,
): Promise<ActionCoordinationReplayResponse<ActionPlanEnvelopeDTO>> {
  const body = replay.body;
  if (!body || typeof body !== "object" || Array.isArray(body)) return replay;
  const record = body as Record<string, unknown>;
  const commitmentIds: string[] = [];
  let carriesPlanIdentity = false;

  if ("plan" in record) {
    carriesPlanIdentity = true;
    const plan = record.plan;
    if (!plan || typeof plan !== "object" || Array.isArray(plan)) {
      return actionCoordinationFailureResult(safetyUnavailable(404));
    }
    const value = (plan as Record<string, unknown>).commitmentId;
    if (typeof value !== "string" || value.length === 0) {
      return actionCoordinationFailureResult(safetyUnavailable(404));
    }
    commitmentIds.push(value);
  }

  const recovery = record.recovery;
  if (recovery && typeof recovery === "object" && !Array.isArray(recovery)) {
    const recoveryRecord = recovery as Record<string, unknown>;
    if (recoveryRecord.action === "OPEN_PLAN") {
      carriesPlanIdentity = true;
      const focus = recoveryRecord.focus;
      if (!focus || typeof focus !== "object" || Array.isArray(focus)) {
        return actionCoordinationFailureResult(safetyUnavailable(404));
      }
      const value = (focus as Record<string, unknown>).commitmentId;
      if (typeof value !== "string" || value.length === 0) {
        return actionCoordinationFailureResult(safetyUnavailable(404));
      }
      commitmentIds.push(value);
    }
  }

  const currentState = record.currentState;
  if (
    currentState &&
    typeof currentState === "object" &&
    !Array.isArray(currentState) &&
    "commitmentId" in currentState
  ) {
    carriesPlanIdentity = true;
    const value = (currentState as Record<string, unknown>).commitmentId;
    if (typeof value !== "string" || value.length === 0) {
      return actionCoordinationFailureResult(safetyUnavailable(404));
    }
    commitmentIds.push(value);
  }

  if (!carriesPlanIdentity) return replay;
  const uniqueCommitmentIds = [...new Set(commitmentIds)];
  if (uniqueCommitmentIds.length !== 1) {
    return actionCoordinationFailureResult(safetyUnavailable(404));
  }
  const commitmentId = uniqueCommitmentIds[0]!;
  const commitment = await tx.planCommitment.findUnique({
    where: { id: commitmentId },
    select: {
      participantAId: true,
      participantBId: true,
      safetyRestrictedAt: true,
      connection: { select: { status: true } },
    },
  });
  if (
    !commitment ||
    commitment.safetyRestrictedAt !== null ||
    (commitment.participantAId !== actorId &&
      commitment.participantBId !== actorId)
  ) {
    return actionCoordinationFailureResult(safetyUnavailable(404));
  }
  const [block, moderation] = await Promise.all([
    tx.block.findFirst({
      where: {
        OR: [
          {
            blockerId: commitment.participantAId,
            blockedId: commitment.participantBId,
          },
          {
            blockerId: commitment.participantBId,
            blockedId: commitment.participantAId,
          },
        ],
      },
      select: { id: true },
    }),
    tx.moderationBlock.findFirst({
      where: {
        userId: {
          in: [commitment.participantAId, commitment.participantBId],
        },
        isActive: true,
      },
      select: { id: true },
    }),
  ]);
  if (block || moderation || commitment.connection.status === "BLOCKED") {
    return actionCoordinationFailureResult(safetyUnavailable(404));
  }
  return replay;
}

function planEventInput(options: {
  graph: LockedPlanContext;
  actorId: string;
  name:
    | "PLAN_PROPOSED"
    | "PLAN_ACCEPTED"
    | "PLAN_COUNTERED"
    | "PLAN_DECLINED"
    | "PLAN_WITHDRAWN";
  revisionId: string;
  commitmentId: string;
  connectionId: string;
  occurredAt: Date;
}) {
  const action = options.graph.interest.classmatePost;
  return {
    businessEventKey:
      options.name === "PLAN_PROPOSED"
        ? businessFunnelEventKeys.planProposed(options.revisionId)
        : options.name === "PLAN_ACCEPTED"
          ? businessFunnelEventKeys.planAccepted(options.revisionId)
          : options.name === "PLAN_COUNTERED"
            ? businessFunnelEventKeys.planCountered(options.revisionId)
            : options.name === "PLAN_DECLINED"
              ? businessFunnelEventKeys.planDeclined(options.revisionId)
              : businessFunnelEventKeys.planWithdrawn(options.revisionId),
    actorId: options.actorId,
    name: options.name,
    surface: "CHAT" as const,
    sourceKind: "PLAN" as const,
    sourceId: options.revisionId,
    connectionId: options.connectionId,
    planRequestId: options.revisionId,
    actionInterestId: options.graph.interest.id,
    interestActivationId: options.graph.currentActivation!.id,
    actionContextId: options.graph.id,
    planCommitmentId: options.commitmentId,
    planRevisionId: options.revisionId,
    interestSurface: options.graph.currentActivation!.interestSurface,
    ...attribution(action),
    occurredAt: options.occurredAt,
  };
}

async function recordFirstPlanCounterpartResponse(
  context: ActionCoordinationTransactionContext,
  graph: LockedPlanContext,
  actorId: string,
): Promise<void> {
  const activation = graph.currentActivation;
  const action = graph.interest.classmatePost;
  if (
    actorId !== graph.interest.userId ||
    graph.state !== "OPEN" ||
    !graph.connectionId ||
    !activation
  ) {
    return;
  }
  const changed = await context.tx.actionCoordinationContext.updateMany({
    where: {
      id: graph.id,
      state: "OPEN",
      connectionId: graph.connectionId,
      firstCounterpartResponseAt: null,
    },
    data: {
      firstCounterpartResponseAt: context.now,
      updatedAt: context.now,
    },
  });
  if (changed.count !== 1) return;
  await recordServerFunnelEvent(context.tx, {
    businessEventKey: businessFunnelEventKeys.firstHumanResponse(graph.id),
    actorId,
    name: "FIRST_HUMAN_RESPONSE",
    surface: "CHAT",
    sourceKind: sourceKind(action.category),
    sourceId: action.id,
    connectionId: graph.connectionId,
    actionInterestId: graph.interest.id,
    interestActivationId: activation.id,
    actionContextId: graph.id,
    interestSurface: activation.interestSurface,
    ...attribution(action),
    occurredAt: context.now,
  });
}

async function enqueuePlanNotification(options: {
  tx: Prisma.TransactionClient;
  kind:
    | "PLAN_PROPOSED"
    | "PLAN_ACCEPTED"
    | "PLAN_COUNTERED"
    | "PLAN_DECLINED"
    | "PLAN_WITHDRAWN";
  recipientId: string;
  eventKey: ReturnType<
    | typeof businessFunnelEventKeys.planProposed
    | typeof businessFunnelEventKeys.planAccepted
    | typeof businessFunnelEventKeys.planCountered
    | typeof businessFunnelEventKeys.planDeclined
    | typeof businessFunnelEventKeys.planWithdrawn
  >;
  connectionId: string;
  commitmentId: string;
  revisionId: string;
  availableAt: Date;
}): Promise<void> {
  await enqueueNotificationOutboxItem(options.tx, {
    kind: options.kind,
    recipientId: options.recipientId,
    sourceKey: notificationOutboxSourceKeys.forBusinessEvent(options.eventKey),
    destination: {
      type: "PLAN",
      connectionId: options.connectionId,
      commitmentId: options.commitmentId,
      revisionId: options.revisionId,
    },
    availableAt: options.availableAt,
  });
}

async function currentPendingForAction(
  tx: Prisma.TransactionClient,
  actionId: string,
) {
  return tx.planCommitment.findFirst({
    where: {
      originActionId: actionId,
      currentPendingRevisionId: { not: null },
      status: { in: ["NEGOTIATING", "CONFIRMED"] },
    },
    select: {
      id: true,
      connectionId: true,
      participantAId: true,
      participantBId: true,
      status: true,
      currentPendingRevisionId: true,
      safetyRestrictedAt: true,
    },
    orderBy: { id: "asc" },
  });
}

/**
 * Transaction-local INITIAL Plan writer shared with future PLAN-first activation.
 * The caller must already hold pair -> Action -> Interest/Activation/Context ->
 * Connection locks, must have run the Plan expiry finalizer, and must not acquire
 * an earlier lock after calling this helper.
 */
export async function createInitialActionPlanInTransaction(
  context: ActionCoordinationTransactionContext,
  options: Readonly<{
    actorId: string;
    resource: DiscoveredContextResource;
    input: NormalizedActionPlanInput;
    allowInitiatingContext?: boolean;
    messageCreatedAt?: Date;
  }>,
): Promise<Readonly<{
  commitmentId: string;
  revisionId: string;
  messageId: string;
  connectionId: string;
  receiverId: string;
}>> {
  const graph = await context.tx.actionCoordinationContext.findUnique({
    where: { id: options.resource.contextId },
    select: planContextSelect,
  });
  if (!graph) throw safetyUnavailable(404);
  await assertContextOrigin(context.tx, graph, options.resource, {
    actorId: options.actorId,
    allowInitiating: options.allowInitiatingContext === true,
    allowExpiredAction: options.allowInitiatingContext !== true,
  });
  await requirePairSafety(
    context.tx,
    options.resource.creatorId,
    options.resource.responderId,
  );
  requireFuturePlan(options.input, context.now);

  const existing = await currentPendingForAction(
    context.tx,
    options.resource.actionId,
  );
  if (existing?.currentPendingRevisionId) {
    await throwActionPlanPendingForActor({
      actorId: options.actorId,
      actionId: options.resource.actionId,
      requestedConnectionId: options.resource.connectionId,
      pending: {
        ...existing,
        currentPendingRevisionId: existing.currentPendingRevisionId,
      },
    });
  }

  const connection = await context.tx.connection.findUnique({
    where: { id: options.resource.connectionId },
    select: { id: true, userAId: true, userBId: true, status: true },
  });
  const connectionParticipants = new Set([
    connection?.userAId,
    connection?.userBId,
  ]);
  if (
    !connection ||
    connection.status !== "ACTIVE" ||
    connectionParticipants.size !== 2 ||
    !connectionParticipants.has(options.resource.creatorId) ||
    !connectionParticipants.has(options.resource.responderId)
  ) {
    throw safetyUnavailable(404);
  }
  const receiverId =
    options.actorId === connection.userAId
      ? connection.userBId
      : options.actorId === connection.userBId
        ? connection.userAId
        : null;
  if (!receiverId) throw safetyUnavailable(404);

  const replyGate = await requirePlanSendAllowed(
    context.tx,
    connection.id,
    options.actorId,
  );

  const commitment = await context.tx.planCommitment.create({
    data: {
      connectionId: connection.id,
      participantAId: connection.userAId,
      participantBId: connection.userBId,
      originActionId: options.resource.actionId,
      originContextId: options.resource.contextId,
      status: "NEGOTIATING",
      createdAt: context.now,
      updatedAt: context.now,
    },
    select: { id: true },
  });
  const startTime = new Date(options.input.startTime);
  const endTime = new Date(options.input.endTime);
  const revision = await context.tx.planRequest.create({
    data: {
      connectionId: connection.id,
      actionInterestId: options.resource.interestId,
      commitmentId: commitment.id,
      revisionKind: "INITIAL",
      originActionId: options.resource.actionId,
      originContextId: options.resource.contextId,
      originKind: "ACTION_INTEREST",
      originId: options.resource.interestId,
      originSnapshot: graph.interest.originSnapshot as Prisma.InputJsonValue,
      proposerUserId: options.actorId,
      receiverUserId: receiverId,
      planType: options.input.planType,
      title: options.input.title,
      location: options.input.location,
      message: options.input.message,
      startTime,
      endTime,
      status: "PENDING",
      createdAt: context.now,
      updatedAt: context.now,
    },
    select: { id: true },
  });
  await context.tx.planCommitment.update({
    where: { id: commitment.id },
    data: { currentPendingRevisionId: revision.id, updatedAt: context.now },
  });
  const messageCreatedAt = options.messageCreatedAt ?? context.now;
  const message = await context.tx.message.create({
    data: {
      connectionId: connection.id,
      senderId: options.actorId,
      body: "",
      type: "PLAN_REQUEST_CARD",
      planRequestId: revision.id,
      actionInterestId: options.resource.interestId,
      actionContextId: options.resource.contextId,
      createdAt: messageCreatedAt,
    },
    select: { id: true },
  });
  await completeDirectReplyGateAfterSend(
    context.tx,
    connection.id,
    messageCreatedAt,
    replyGate,
  );

  const event = planEventInput({
    graph,
    actorId: options.actorId,
    name: "PLAN_PROPOSED",
    revisionId: revision.id,
    commitmentId: commitment.id,
    connectionId: connection.id,
    occurredAt: messageCreatedAt,
  });
  await recordServerFunnelEvent(context.tx, event);
  await enqueuePlanNotification({
    tx: context.tx,
    kind: "PLAN_PROPOSED",
    recipientId: receiverId,
    eventKey: event.businessEventKey,
    connectionId: connection.id,
    commitmentId: commitment.id,
    revisionId: revision.id,
    availableAt: messageCreatedAt,
  });
  if (graph.state === "OPEN") {
    await recordFirstPlanCounterpartResponse(context, graph, options.actorId);
  }
  return Object.freeze({
    commitmentId: commitment.id,
    revisionId: revision.id,
    messageId: message.id,
    connectionId: connection.id,
    receiverId,
  });
}

export async function createActionPlan(options: {
  actorId: string;
  contextId: string;
  idempotencyKey: string;
  input: InitialActionPlanInput;
  dependencies?: ActionPlanServiceDependencies;
}): Promise<ActionPlanMutationResult> {
  const input = normalizePlanInput(options.input);
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  let resource = await discoverContextResource(
    db,
    options.contextId,
    options.actorId,
  );
  if (resource) {
    await runPlanPreflights({
      db,
      actionId: resource.actionId,
      dependencies,
    });
    resource = await discoverContextResource(
      db,
      options.contextId,
      options.actorId,
    );
  }

  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: "POST",
        operationId: "createCreatorGatedActionPlan",
        resourceKind: "ACTION_CONTEXT",
        resourceId: options.contextId,
        body: input,
      }),
      pairs: resource ? [resource.pair] : [],
      refreshReplay: (context, replay) =>
        refreshPrivacySafePlanReplay(context.tx, replay, options.actorId),
      execute: async (context) => {
        if (!resource) throw safetyUnavailable(404);
        await lockAction(context.tx, resource.actionId);
        const graph = await lockContextGraph(context.tx, resource);
        await assertContextOrigin(context.tx, graph, resource, {
          actorId: options.actorId,
          allowInitiating: false,
          allowExpiredAction: true,
        });
        await lockConnection(context.tx, resource);
        const pending = await currentPendingForAction(
          context.tx,
          resource.actionId,
        );
        if (pending) {
          await finalizeStablePlanLifecycleInTransaction(context, {
            commitmentId: pending.id,
          });
        }
        const created = await createInitialActionPlanInTransaction(context, {
          actorId: options.actorId,
          resource,
          input,
        });
        return {
          status: 201,
          body: envelope({
            commitmentId: created.commitmentId,
            revisionId: created.revisionId,
            connectionId: created.connectionId,
            commitmentStatus: "NEGOTIATING",
            revisionStatus: "PENDING",
          }),
        };
      },
    },
    {
      db,
      clock: dependencies.clock,
      transactionOptions: dependencies.transactionOptions,
    },
  );
}

async function loadLockedRevisionGraph(
  context: ActionCoordinationTransactionContext,
  resource: DiscoveredRevisionResource,
  actorId: string,
): Promise<Readonly<{
  graph: LockedPlanContext;
  commitment: LockedCommitment;
  revision: LockedRevision;
}>> {
  await lockAction(context.tx, resource.actionId);
  const graph = await lockContextGraph(context.tx, resource);
  await assertContextOrigin(context.tx, graph, resource, {
    actorId,
    allowInitiating: false,
    allowExpiredAction: true,
  });
  await lockConnection(context.tx, resource);
  await requirePairSafety(
    context.tx,
    resource.creatorId,
    resource.responderId,
  );
  await finalizeStablePlanLifecycleInTransaction(context, {
    commitmentId: resource.commitmentId,
  });
  const commitment = await lockCommitment(context.tx, resource.commitmentId);
  const revision = await lockRevision(context.tx, resource.revisionId);
  assertCommitmentGraph(commitment, revision, resource);
  return Object.freeze({ graph, commitment, revision });
}

export async function counterActionPlan(options: {
  actorId: string;
  revisionId: string;
  idempotencyKey: string;
  input: InitialActionPlanInput;
  dependencies?: ActionPlanServiceDependencies;
}): Promise<ActionPlanMutationResult> {
  const input = normalizePlanInput(options.input);
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  let resource = await discoverRevisionResource(
    db,
    options.revisionId,
    options.actorId,
  );
  if (resource) {
    await runPlanPreflights({
      db,
      actionId: resource.actionId,
      commitmentId: resource.commitmentId,
      dependencies,
    });
    resource = await discoverRevisionResource(
      db,
      options.revisionId,
      options.actorId,
    );
  }
  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: "POST",
        operationId: "counterCreatorGatedActionPlan",
        resourceKind: "PLAN_REVISION",
        resourceId: options.revisionId,
        body: input,
      }),
      pairs: resource ? [resource.pair] : [],
      refreshReplay: (context, replay) =>
        refreshPrivacySafePlanReplay(context.tx, replay, options.actorId),
      execute: async (context) => {
        if (!resource) throw safetyUnavailable(404);
        const { graph, commitment, revision } =
          await loadLockedRevisionGraph(context, resource, options.actorId);
        requireFuturePlan(input, context.now);
        if (
          commitment.status !== "NEGOTIATING" ||
          commitment.currentAcceptedRevisionId !== null ||
          commitment.currentPendingRevisionId !== revision.id ||
          revision.status !== "PENDING"
        ) {
          planRecoveryConflict({
            code: "PLAN_CHANGE_PENDING",
            message: "This Plan proposal is no longer current.",
            actionId: resource.actionId,
            connectionId: commitment.connectionId,
            commitmentId: commitment.id,
            revisionId: commitment.currentPendingRevisionId ?? revision.id,
            commitmentStatus: commitment.status,
            revisionStatus: revision.status,
          });
        }
        if (revision.receiverUserId !== options.actorId) {
          throw safetyUnavailable(404);
        }

        const replyGate = await requirePlanSendAllowed(
          context.tx,
          commitment.connectionId,
          options.actorId,
        );

        await context.tx.planRequest.update({
          where: { id: revision.id },
          data: {
            status: "COUNTER_PROPOSED",
            resolvedAt: context.now,
            resolvedByUserId: options.actorId,
            resolutionReason: null,
            updatedAt: context.now,
          },
        });
        const counter = await context.tx.planRequest.create({
          data: {
            connectionId: commitment.connectionId,
            counterOfId: revision.id,
            actionInterestId: revision.actionInterestId,
            commitmentId: commitment.id,
            revisionKind: "INITIAL",
            originActionId: revision.originActionId,
            originContextId: revision.originContextId,
            originKind: revision.originKind,
            originId: revision.originId,
            originSnapshot: revision.originSnapshot as Prisma.InputJsonValue,
            proposerUserId: options.actorId,
            receiverUserId: revision.proposerUserId,
            planType: input.planType,
            title: input.title,
            location: input.location,
            message: input.message,
            startTime: new Date(input.startTime),
            endTime: new Date(input.endTime),
            status: "PENDING",
            createdAt: context.now,
            updatedAt: context.now,
          },
          select: { id: true },
        });
        await context.tx.planCommitment.update({
          where: { id: commitment.id },
          data: {
            currentPendingRevisionId: counter.id,
            updatedAt: context.now,
          },
        });
        const message = await context.tx.message.create({
          data: {
            connectionId: commitment.connectionId,
            senderId: options.actorId,
            body: "",
            type: "PLAN_REQUEST_CARD",
            planRequestId: counter.id,
            actionInterestId: resource.interestId,
            actionContextId: resource.contextId,
            createdAt: context.now,
          },
        });
        await completeDirectReplyGateAfterSend(
          context.tx,
          commitment.connectionId,
          message.createdAt,
          replyGate,
        );
        await recordFirstPlanCounterpartResponse(context, graph, options.actorId);
        const event = planEventInput({
          graph,
          actorId: options.actorId,
          name: "PLAN_COUNTERED",
          revisionId: counter.id,
          commitmentId: commitment.id,
          connectionId: commitment.connectionId,
          occurredAt: context.now,
        });
        await recordServerFunnelEvent(context.tx, event);
        await enqueuePlanNotification({
          tx: context.tx,
          kind: "PLAN_COUNTERED",
          recipientId: revision.proposerUserId,
          eventKey: event.businessEventKey,
          connectionId: commitment.connectionId,
          commitmentId: commitment.id,
          revisionId: counter.id,
          availableAt: context.now,
        });
        return {
          status: 201,
          body: envelope({
            commitmentId: commitment.id,
            revisionId: counter.id,
            connectionId: commitment.connectionId,
            commitmentStatus: "NEGOTIATING",
            revisionStatus: "PENDING",
          }),
        };
      },
    },
    {
      db,
      clock: dependencies.clock,
      transactionOptions: dependencies.transactionOptions,
    },
  );
}

async function resolvePendingInitialActionPlan(options: {
  actorId: string;
  revisionId: string;
  idempotencyKey: string;
  resolution: "DECLINE" | "WITHDRAW";
  dependencies?: ActionPlanServiceDependencies;
}): Promise<ActionPlanMutationResult> {
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  let resource = await discoverRevisionResource(
    db,
    options.revisionId,
    options.actorId,
  );
  if (resource) {
    await runPlanPreflights({
      db,
      actionId: resource.actionId,
      commitmentId: resource.commitmentId,
      dependencies,
    });
    resource = await discoverRevisionResource(
      db,
      options.revisionId,
      options.actorId,
    );
  }
  const isDecline = options.resolution === "DECLINE";
  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: isDecline ? "POST" : "DELETE",
        operationId: isDecline
          ? "declineCreatorGatedActionPlan"
          : "withdrawCreatorGatedActionPlan",
        resourceKind: "PLAN_REVISION",
        resourceId: options.revisionId,
        body: null,
      }),
      pairs: resource ? [resource.pair] : [],
      refreshReplay: (context, replay) =>
        refreshPrivacySafePlanReplay(context.tx, replay, options.actorId),
      execute: async (context) => {
        if (!resource) throw safetyUnavailable(404);
        const { graph, commitment, revision } =
          await loadLockedRevisionGraph(context, resource, options.actorId);
        if (
          commitment.status !== "NEGOTIATING" ||
          commitment.currentAcceptedRevisionId !== null ||
          commitment.currentPendingRevisionId !== revision.id ||
          revision.status !== "PENDING"
        ) {
          planRecoveryConflict({
            code: "PLAN_CHANGE_PENDING",
            message: "This Plan proposal is no longer current.",
            actionId: resource.actionId,
            connectionId: commitment.connectionId,
            commitmentId: commitment.id,
            revisionId: commitment.currentPendingRevisionId ?? revision.id,
            commitmentStatus: commitment.status,
            revisionStatus: revision.status,
          });
        }
        if (
          (isDecline && revision.receiverUserId !== options.actorId) ||
          (!isDecline && revision.proposerUserId !== options.actorId)
        ) {
          throw safetyUnavailable(404);
        }

        const replyGate = isDecline
          ? await requirePlanSendAllowed(
              context.tx,
              commitment.connectionId,
              options.actorId,
            )
          : null;

        const revisionStatus = isDecline ? "DECLINED" : "CANCELED";
        await context.tx.planRequest.update({
          where: { id: revision.id },
          data: {
            status: revisionStatus,
            resolutionReason: isDecline
              ? "RECEIVER_DECLINED"
              : "PROPOSER_WITHDREW",
            resolvedAt: context.now,
            resolvedByUserId: options.actorId,
            updatedAt: context.now,
          },
        });
        await context.tx.planCommitment.update({
          where: { id: commitment.id },
          data: {
            status: "CLOSED",
            currentPendingRevisionId: null,
            updatedAt: context.now,
          },
        });
        if (!isDecline) {
          // Direct-chat realtime observes Message rows, not PlanRequest rows.
          // Touch the existing proposal card so the receiver reloads its now-
          // CANCELED Plan without creating a synthetic reply or consuming the
          // first-contact reply allowance.
          const refreshed = await context.tx.message.updateMany({
            where: {
              connectionId: commitment.connectionId,
              senderId: revision.proposerUserId,
              planRequestId: revision.id,
              type: "PLAN_REQUEST_CARD",
              body: "",
            },
            data: { body: "" },
          });
          if (refreshed.count !== 1) {
            throw new Error(
              "Withdrawing an Action Plan requires exactly one existing proposal card.",
            );
          }
        }
        if (isDecline) {
          const responseCard = await context.tx.message.create({
            data: {
              connectionId: commitment.connectionId,
              senderId: options.actorId,
              body: "",
              type: "PLAN_REQUEST_CARD",
              planRequestId: revision.id,
              actionInterestId: resource.interestId,
              actionContextId: resource.contextId,
              createdAt: context.now,
            },
          });
          await completeDirectReplyGateAfterSend(
            context.tx,
            commitment.connectionId,
            responseCard.createdAt,
            replyGate!,
          );
          await recordFirstPlanCounterpartResponse(
            context,
            graph,
            options.actorId,
          );
        }
        const event = planEventInput({
          graph,
          actorId: options.actorId,
          name: isDecline ? "PLAN_DECLINED" : "PLAN_WITHDRAWN",
          revisionId: revision.id,
          commitmentId: commitment.id,
          connectionId: commitment.connectionId,
          occurredAt: context.now,
        });
        await recordServerFunnelEvent(context.tx, event);
        await enqueuePlanNotification({
          tx: context.tx,
          kind: isDecline ? "PLAN_DECLINED" : "PLAN_WITHDRAWN",
          recipientId: isDecline
            ? revision.proposerUserId
            : revision.receiverUserId,
          eventKey: event.businessEventKey,
          connectionId: commitment.connectionId,
          commitmentId: commitment.id,
          revisionId: revision.id,
          availableAt: context.now,
        });
        return {
          status: 200,
          body: envelope({
            commitmentId: commitment.id,
            revisionId: revision.id,
            connectionId: commitment.connectionId,
            commitmentStatus: "CLOSED",
            revisionStatus,
          }),
        };
      },
    },
    {
      db,
      clock: dependencies.clock,
      transactionOptions: dependencies.transactionOptions,
    },
  );
}

export function declineActionPlan(options: {
  actorId: string;
  revisionId: string;
  idempotencyKey: string;
  dependencies?: ActionPlanServiceDependencies;
}): Promise<ActionPlanMutationResult> {
  return resolvePendingInitialActionPlan({ ...options, resolution: "DECLINE" });
}

export function withdrawActionPlan(options: {
  actorId: string;
  revisionId: string;
  idempotencyKey: string;
  dependencies?: ActionPlanServiceDependencies;
}): Promise<ActionPlanMutationResult> {
  return resolvePendingInitialActionPlan({ ...options, resolution: "WITHDRAW" });
}

function lockedPairSet(pairs: readonly CanonicalUserPair[]): Set<string> {
  return new Set(pairs.map(canonicalPairResourceId));
}

function assertEveryActionPairLocked(options: {
  actionId: string;
  creatorId: string;
  responders: readonly string[];
  pairs: readonly CanonicalUserPair[];
}): void {
  const locked = lockedPairSet(options.pairs);
  for (const pair of stableCanonicalPairs(
    options.responders.map(
      (responderId) => [options.creatorId, responderId] as const,
    ),
  )) {
    if (!locked.has(canonicalPairResourceId(pair))) {
      throw new ChangedFulfillmentPairSnapshotError(options.actionId);
    }
  }
}

async function lockAllActionContexts(
  context: ActionCoordinationTransactionContext,
  actionId: string,
  creatorId: string,
): Promise<LockedActionContextRow[]> {
  const interests = await context.tx.$queryRaw<
    Array<{ interestId: string; responderId: string }>
  >(Prisma.sql`
    SELECT "id" AS "interestId", "userId" AS "responderId"
    FROM "ActionInterest"
    WHERE "classmatePostId" = ${actionId}
    ORDER BY "id"
    FOR UPDATE
  `);
  assertEveryActionPairLocked({
    actionId,
    creatorId,
    responders: interests.map((row) => row.responderId),
    pairs: context.pairs,
  });
  const rows = await context.tx.$queryRaw<LockedActionContextRow[]>(Prisma.sql`
    SELECT
      interest."id" AS "interestId",
      interest."userId" AS "responderId",
      coordination."id" AS "contextId",
      coordination."state" AS "contextState",
      coordination."reservationGeneration",
      coordination."connectionId",
      activation."id" AS "activationId",
      activation."connectedAt" AS "activationConnectedAt",
      activation."terminalReason" AS "activationTerminalReason",
      activation."interestSurface"
    FROM "ActionInterest" interest
    INNER JOIN "ActionCoordinationContext" coordination
      ON coordination."interestId" = interest."id"
    INNER JOIN "ActionInterestActivation" activation
      ON activation."id" = coordination."currentActivationId"
    WHERE interest."classmatePostId" = ${actionId}
    ORDER BY interest."id", activation."id", coordination."id"
    FOR UPDATE OF activation, coordination
  `);
  if (rows.length !== interests.length) {
    throw new Error(
      "A creator-gated Action Interest has no authoritative Context activation.",
    );
  }
  return rows;
}

async function recordContextEndedForFulfillment(options: {
  context: ActionCoordinationTransactionContext;
  graph: LockedPlanContext;
  row: LockedActionContextRow;
  endReason: "PLAN_CONFIRMED" | "SOURCE_FULFILLED";
  actorId: string;
}): Promise<void> {
  const action = options.graph.interest.classmatePost;
  await options.context.tx.actionCoordinationContext.update({
    where: { id: options.row.contextId },
    data: {
      state: "ENDED",
      reservationId: null,
      leaseExpiresAt: null,
      endedAt: options.context.now,
      endedById:
        options.endReason === "PLAN_CONFIRMED" ? options.actorId : null,
      endReason: options.endReason,
      updatedAt: options.context.now,
    },
  });
  await recordServerFunnelEvent(options.context.tx, {
    businessEventKey: businessFunnelEventKeys.coordinationEnded(
      options.row.contextId,
    ),
    actorId:
      options.endReason === "PLAN_CONFIRMED"
        ? options.actorId
        : action.userId,
    name: "COORDINATION_ENDED",
    surface: "CHAT",
    sourceKind: sourceKind(action.category),
    sourceId: action.id,
    connectionId: options.row.connectionId ?? undefined,
    actionInterestId: options.row.interestId,
    interestActivationId: options.row.activationId,
    actionContextId: options.row.contextId,
    interestSurface: options.row.interestSurface,
    ...attribution(action),
    occurredAt: options.context.now,
  });
}

async function makeUnconnectedContextUnavailable(options: {
  context: ActionCoordinationTransactionContext;
  graph: LockedPlanContext;
  row: LockedActionContextRow;
}): Promise<void> {
  const action = options.graph.interest.classmatePost;
  await options.context.tx.actionCoordinationContext.update({
    where: { id: options.row.contextId },
    data: {
      state: "UNAVAILABLE",
      reservationId: null,
      leaseExpiresAt: null,
      updatedAt: options.context.now,
    },
  });
  if (options.row.contextState === "INITIATING") {
    await recordServerFunnelEvent(options.context.tx, {
      businessEventKey: businessFunnelEventKeys.coordinationReleased(
        options.row.contextId,
        options.row.reservationGeneration,
      ),
      actorId: action.userId,
      name: "COORDINATION_RELEASED",
      surface: funnelSurface(options.row.interestSurface),
      sourceKind: sourceKind(action.category),
      sourceId: action.id,
      actionInterestId: options.row.interestId,
      interestActivationId: options.row.activationId,
      actionContextId: options.row.contextId,
      ...attribution(action),
      occurredAt: options.context.now,
    });
  }
  if (
    options.row.activationConnectedAt === null &&
    options.row.activationTerminalReason === null
  ) {
    const changed = await options.context.tx.actionInterestActivation.updateMany({
      where: {
        id: options.row.activationId,
        connectedAt: null,
        terminalReason: null,
      },
      data: {
        terminalReason: "ACTION_FULFILLED_BEFORE_CONNECT",
        terminalAt: options.context.now,
      },
    });
    if (changed.count === 1) {
      await recordServerFunnelEvent(options.context.tx, {
        businessEventKey: businessFunnelEventKeys.actionInterestTerminated(
          options.row.activationId,
        ),
        actorId: options.row.responderId,
        name: "ACTION_INTEREST_TERMINATED",
        surface: funnelSurface(options.row.interestSurface),
        sourceKind: sourceKind(action.category),
        sourceId: action.id,
        actionInterestId: options.row.interestId,
        interestActivationId: options.row.activationId,
        actionContextId: options.row.contextId,
        interestSurface: options.row.interestSurface,
        terminalReason: "ACTION_FULFILLED_BEFORE_CONNECT",
        ...attribution(action),
        occurredAt: options.context.now,
      });
    }
  }
}

async function acceptActionPlanAttempt(options: {
  actorId: string;
  revisionId: string;
  idempotencyKey: string;
  dependencies: ActionPlanServiceDependencies;
  resource: DiscoveredRevisionResource | null;
  affectedPairs: readonly UserPairInput[];
}): Promise<ActionPlanMutationResult> {
  const db = database(options.dependencies);
  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: "POST",
        operationId: "acceptCreatorGatedActionPlan",
        resourceKind: "PLAN_REVISION",
        resourceId: options.revisionId,
        body: null,
      }),
      pairs: options.affectedPairs,
      refreshReplay: (context, replay) =>
        refreshPrivacySafePlanReplay(context.tx, replay, options.actorId),
      execute: async (context) => {
        const resource = options.resource;
        if (!resource) throw safetyUnavailable(404);
        await lockAction(context.tx, resource.actionId);
        const allContexts = await lockAllActionContexts(
          context,
          resource.actionId,
          resource.creatorId,
        );
        const winningRow = allContexts.find(
          (row) => row.contextId === resource.contextId,
        );
        if (!winningRow || winningRow.interestId !== resource.interestId) {
          throw safetyUnavailable(404);
        }
        const graph = await context.tx.actionCoordinationContext.findUnique({
          where: { id: resource.contextId },
          select: planContextSelect,
        });
        if (!graph) throw safetyUnavailable(404);
        const fulfilledByPlanId =
          graph.interest.classmatePost.fulfilledByPlanId;
        if (fulfilledByPlanId) {
          await throwActionFulfilledForActor({
            tx: context.tx,
            actorId: options.actorId,
            actionId: resource.actionId,
            commitmentId: fulfilledByPlanId,
          });
        }
        await assertContextOrigin(context.tx, graph, resource, {
          actorId: options.actorId,
          allowInitiating: false,
          allowExpiredAction: true,
        });
        await lockConnection(context.tx, resource);
        await requirePairSafety(
          context.tx,
          resource.creatorId,
          resource.responderId,
        );
        await finalizeStablePlanLifecycleInTransaction(context, {
          commitmentId: resource.commitmentId,
        });
        const commitment = await lockCommitment(
          context.tx,
          resource.commitmentId,
        );
        const revision = await lockRevision(context.tx, resource.revisionId);
        assertCommitmentGraph(commitment, revision, resource);
        requireFuturePlan(
          {
            planType: revision.planType,
            title: revision.title,
            location: revision.location,
            message: revision.message,
            startTime: revision.startTime.toISOString(),
            endTime: revision.endTime.toISOString(),
          },
          context.now,
        );
        if (
          commitment.status !== "NEGOTIATING" ||
          commitment.currentAcceptedRevisionId !== null ||
          commitment.currentPendingRevisionId !== revision.id ||
          revision.status !== "PENDING"
        ) {
          planRecoveryConflict({
            code: "PLAN_CHANGE_PENDING",
            message: "This Plan proposal is no longer current.",
            actionId: resource.actionId,
            connectionId: commitment.connectionId,
            commitmentId: commitment.id,
            revisionId: commitment.currentPendingRevisionId ?? revision.id,
            commitmentStatus: commitment.status,
            revisionStatus: revision.status,
          });
        }
        if (revision.receiverUserId !== options.actorId) {
          throw safetyUnavailable(404);
        }
        const action = graph.interest.classmatePost;
        if (action.status === "REMOVED") throw safetyUnavailable(404);
        if (action.fulfilledByPlanId !== null) {
          await throwActionFulfilledForActor({
            tx: context.tx,
            actorId: options.actorId,
            actionId: action.id,
            commitmentId: action.fulfilledByPlanId,
          });
        }

        const replyGate = await requirePlanSendAllowed(
          context.tx,
          commitment.connectionId,
          options.actorId,
        );
        const fulfilled = await context.tx.classmatePost.updateMany({
          where: {
            id: resource.actionId,
            fulfilledByPlanId: null,
            status: { in: ["ACTIVE", "CLOSED", "EXPIRED"] },
          },
          data: {
            status: "FULFILLED",
            fulfilledByPlanId: commitment.id,
            fulfilledAt: context.now,
            updatedAt: context.now,
          },
        });
        if (fulfilled.count !== 1) {
          const current = await context.tx.classmatePost.findUnique({
            where: { id: resource.actionId },
            select: { fulfilledByPlanId: true },
          });
          if (current?.fulfilledByPlanId) {
            await throwActionFulfilledForActor({
              tx: context.tx,
              actorId: options.actorId,
              actionId: resource.actionId,
              commitmentId: current.fulfilledByPlanId,
            });
          }
          throw safetyUnavailable(404);
        }
        await recordFirstPlanCounterpartResponse(
          context,
          graph,
          options.actorId,
        );
        await context.tx.planRequest.update({
          where: { id: revision.id },
          data: {
            status: "ACCEPTED",
            resolutionReason: null,
            resolvedAt: context.now,
            resolvedByUserId: options.actorId,
            updatedAt: context.now,
          },
        });
        await context.tx.planCommitment.update({
          where: { id: commitment.id },
          data: {
            status: "CONFIRMED",
            currentAcceptedRevisionId: revision.id,
            currentPendingRevisionId: null,
            confirmedAt: context.now,
            updatedAt: context.now,
          },
        });
        await context.tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
          SELECT "id"
          FROM "CalendarEntry"
          WHERE "planCommitmentId" = ${commitment.id}
          ORDER BY "id"
          FOR UPDATE
        `);
        await materializePlanCalendarEntries(context.tx, {
          planRequestId: revision.id,
          planCommitmentId: commitment.id,
          proposerUserId: revision.proposerUserId,
          proposerName: null,
          receiverUserId: revision.receiverUserId,
          receiverName: null,
          title: revision.title,
          planType: revision.planType,
          location: revision.location,
          note: revision.message,
          startTime: revision.startTime,
          endTime: revision.endTime,
        });
        const projections = await context.tx.calendarEntry.findMany({
          where: { planCommitmentId: commitment.id },
          select: { userId: true, projectionStatus: true },
          orderBy: { userId: "asc" },
        });
        const expectedParticipants = new Set([
          commitment.participantAId,
          commitment.participantBId,
        ]);
        if (
          projections.length !== 2 ||
          projections.some(
            (projection) =>
              projection.projectionStatus !== "ACTIVE" ||
              !expectedParticipants.has(projection.userId),
          )
        ) {
          throw new Error(
            "Initial Plan confirmation did not create exactly two active projections.",
          );
        }

        for (const row of allContexts) {
          if (row.contextState === "OPEN") {
            await recordContextEndedForFulfillment({
              context,
              graph,
              row,
              endReason:
                row.contextId === resource.contextId
                  ? "PLAN_CONFIRMED"
                  : "SOURCE_FULFILLED",
              actorId: options.actorId,
            });
          } else if (
            row.contextState === "WAITING" ||
            row.contextState === "INITIATING"
          ) {
            await makeUnconnectedContextUnavailable({ context, graph, row });
          }
        }

        const confirmationCard = await context.tx.message.create({
          data: {
            connectionId: commitment.connectionId,
            senderId: options.actorId,
            body: "",
            type: "PLAN_CONFIRMED_CARD",
            planRequestId: revision.id,
            actionInterestId: resource.interestId,
            actionContextId: resource.contextId,
            createdAt: context.now,
          },
        });
        await completeDirectReplyGateAfterSend(
          context.tx,
          commitment.connectionId,
          confirmationCard.createdAt,
          replyGate,
        );
        const event = planEventInput({
          graph,
          actorId: options.actorId,
          name: "PLAN_ACCEPTED",
          revisionId: revision.id,
          commitmentId: commitment.id,
          connectionId: commitment.connectionId,
          occurredAt: context.now,
        });
        await recordServerFunnelEvent(context.tx, event);
        await enqueuePlanNotification({
          tx: context.tx,
          kind: "PLAN_ACCEPTED",
          recipientId: revision.proposerUserId,
          eventKey: event.businessEventKey,
          connectionId: commitment.connectionId,
          commitmentId: commitment.id,
          revisionId: revision.id,
          availableAt: context.now,
        });
        return {
          status: 200,
          body: envelope({
            commitmentId: commitment.id,
            revisionId: revision.id,
            connectionId: commitment.connectionId,
            commitmentStatus: "CONFIRMED",
            revisionStatus: "ACCEPTED",
          }),
        };
      },
    },
    {
      db,
      clock: options.dependencies.clock,
      transactionOptions: options.dependencies.transactionOptions,
    },
  );
}

export async function acceptActionPlan(options: {
  actorId: string;
  revisionId: string;
  idempotencyKey: string;
  dependencies?: ActionPlanServiceDependencies;
}): Promise<ActionPlanMutationResult> {
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  for (
    let attempt = 1;
    attempt <= MAX_ACTION_PAIR_SNAPSHOT_ATTEMPTS;
    attempt += 1
  ) {
    let resource = await discoverRevisionResource(
      db,
      options.revisionId,
      options.actorId,
    );
    if (resource) {
      await runPlanPreflights({
        db,
        actionId: resource.actionId,
        commitmentId: resource.commitmentId,
        dependencies,
      });
      resource = await discoverRevisionResource(
        db,
        options.revisionId,
        options.actorId,
      );
    }
    const snapshot = resource
      ? await snapshotActionExpiryPairs(resource.actionId, db)
      : null;
    try {
      return await acceptActionPlanAttempt({
        actorId: options.actorId,
        revisionId: options.revisionId,
        idempotencyKey: options.idempotencyKey,
        dependencies,
        resource,
        affectedPairs: snapshot?.pairs ?? (resource ? [resource.pair] : []),
      });
    } catch (cause) {
      if (
        cause instanceof ChangedFulfillmentPairSnapshotError &&
        attempt < MAX_ACTION_PAIR_SNAPSHOT_ATTEMPTS
      ) {
        continue;
      }
      throw cause;
    }
  }
  throw new Error("Action Plan fulfillment pair snapshot retry loop exited.");
}
