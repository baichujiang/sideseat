import "server-only";

import {
  type ActionInterestSurface,
  type ClassmatePostCategory,
  type ExperimentVariant,
  MessageType,
  type PlanType,
  Prisma,
  type PrismaClient,
  type ProductFunnelSourceKind,
} from "@prisma/client";

import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { normalizeSchoolCode } from "@/lib/constants/schools";
import {
  assertDirectUnrepliedSendAllowed,
  createDirectMessageRecord,
  PeerReplyRequiredError,
} from "@/lib/chat/direct-message-service";
import {
  CanonicalConnectionIntegrityError,
  withCanonicalConnectionScope,
} from "@/lib/connections/canonical-connection";
import { prisma } from "@/lib/db/prisma";
import { parseActionOriginSnapshot } from "@/lib/v2/action-context-snapshot";
import {
  ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
  type ActionCoordinationCapability,
} from "@/lib/v2/action-coordination/capability";
import {
  buildActionCoordinationCommandIdentity,
  runAtomicActionCoordinationCommand,
  type ActionCoordinationAtomicCommandResult,
  type ActionCoordinationClock,
  type ActionCoordinationReplayResponse,
  type ActionCoordinationTransactionOptions,
} from "@/lib/v2/action-coordination/command";
import type { ActionCoordinationJsonObject } from "@/lib/v2/action-coordination/dto";
import {
  ActionCoordinationFailure,
  safetyUnavailable,
} from "@/lib/v2/action-coordination/errors";
import {
  createInitialActionPlanInTransaction,
  type InitialActionPlanInput,
  type NormalizedActionPlanInput,
} from "@/lib/v2/action-coordination/plan-service";
import {
  actionPolicyTupleKind,
  CREATOR_GATED_ACTION_EXPERIMENT_KEY,
} from "@/lib/v2/action-coordination/policy-snapshot";
import { actionCoordinationFailureResult } from "@/lib/v2/action-coordination/route-adapter";
import {
  finalizeActionExpiry,
  releaseInitiatingReservationInTransaction,
  type ActionLifecycleFinalizerDependencies,
} from "@/lib/v2/action-lifecycle-finalizer";
import { getCreatorGatedActionToPlanAssignment } from "@/lib/v2/experiments";
import { isCreatorGatedExperimentEnrollmentEnabled } from "@/lib/v2/feature-flags";
import {
  businessFunnelEventKeys,
  recordServerFunnelEvent,
} from "@/lib/v2/funnel-events";
import {
  enqueueNotificationOutboxItem,
  notificationOutboxSourceKeys,
} from "@/lib/v2/notification-outbox-producer";

export type ActionCoordinationFirstMessageInput = Readonly<{
  type: "MESSAGE";
  body: string;
}>;

export type ActionCoordinationFirstPlanInput = Readonly<
  { type: "PLAN" } & InitialActionPlanInput
>;

export type ActionCoordinationFirstContentInput =
  | ActionCoordinationFirstMessageInput
  | ActionCoordinationFirstPlanInput;

type NormalizedActionCoordinationFirstContent =
  | ActionCoordinationFirstMessageInput
  | Readonly<{ type: "PLAN" } & NormalizedActionPlanInput>;

type MessageActivationDTO = ActionCoordinationJsonObject & {
  connectionId: string;
  contextId: string;
  sourceCardMessageId: string;
  firstMessageId: string;
  firstContentType: "MESSAGE";
  focus: ActionCoordinationJsonObject & {
    type: "ACTION_CONTEXT";
    connectionId: string;
    contextId: string;
  };
};

type PlanActivationDTO = ActionCoordinationJsonObject & {
  connectionId: string;
  contextId: string;
  sourceCardMessageId: string;
  planCardMessageId: string;
  commitmentId: string;
  revisionId: string;
  firstContentType: "PLAN";
  focus: ActionCoordinationJsonObject & {
    type: "PLAN";
    connectionId: string;
    commitmentId: string;
    revisionId: string;
  };
};

export type ActionCoordinationActivationEnvelopeDTO =
  ActionCoordinationJsonObject & {
    activation: MessageActivationDTO | PlanActivationDTO;
  };

export type ActionCoordinationActivationMutationResult =
  ActionCoordinationAtomicCommandResult<ActionCoordinationActivationEnvelopeDTO>;

type StableAssignment = Readonly<{
  key: string;
  eligible: boolean;
  variant: ExperimentVariant;
}>;

type AssignmentResolver = (
  user: Readonly<{ id: string; email: string | null; username: string }>,
  capability: ActionCoordinationCapability,
  tx: Prisma.TransactionClient,
) => Promise<StableAssignment>;

const MINIMUM_PLAN_DURATION_MS = 30 * 60_000;
const ACTION_PLAN_TYPES = new Set<PlanType>([
  "STUDY",
  "MEAL",
  "SPORTS",
  "LANGUAGE",
  "CUSTOM",
]);

export type ActionCoordinationActivationServiceDependencies = Readonly<{
  db?: PrismaClient;
  clock?: ActionCoordinationClock;
  transactionOptions?: ActionCoordinationTransactionOptions;
  enrollmentAllowed?: () => boolean;
  resolveAssignment?: AssignmentResolver;
  finalizeExpiry?: (
    actionId: string,
    dependencies: ActionLifecycleFinalizerDependencies,
  ) => ReturnType<typeof finalizeActionExpiry>;
}>;

const activationGraphSelect = Prisma.validator<Prisma.ActionInterestSelect>()({
  id: true,
  userId: true,
  classmatePostId: true,
  connectionId: true,
  status: true,
  originSnapshot: true,
  user: {
    select: {
      id: true,
      school: true,
      onboardingComplete: true,
      isGuest: true,
      verifiedStudent: true,
    },
  },
  classmatePost: {
    select: {
      id: true,
      userId: true,
      category: true,
      status: true,
      visibility: true,
      startsAt: true,
      endsAt: true,
      expiresAt: true,
      fulfilledByPlanId: true,
      coordinationPolicy: true,
      policySchemaVersion: true,
      policyParametersSnapshot: true,
      experimentKeySnapshot: true,
      experimentVariantSnapshot: true,
      clientCapabilitySnapshot: true,
      policySnapshottedAt: true,
      user: {
        select: {
          id: true,
          email: true,
          username: true,
          school: true,
          onboardingComplete: true,
          isGuest: true,
        },
      },
      courses: {
        select: {
          courseId: true,
          course: { select: { id: true, code: true, name: true } },
        },
        orderBy: { courseId: "asc" },
      },
    },
  },
  coordinationContext: {
    select: {
      id: true,
      currentActivationId: true,
      state: true,
      reservationId: true,
      reservationGeneration: true,
      leaseExpiresAt: true,
      connectionId: true,
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
    },
  },
});

type ActivationGraph = Prisma.ActionInterestGetPayload<{
  select: typeof activationGraphSelect;
}>;

type DiscoveredActivationResource = Readonly<{
  actionId: string;
  contextId: string;
  interestId: string;
  creatorId: string;
  responderId: string;
  pair: readonly [string, string];
  source: "RESERVATION" | "RECEIPT";
}>;

function database(dependencies: ActionCoordinationActivationServiceDependencies) {
  return dependencies.db ?? prisma;
}

function activationRequest(options: {
  actorId: string;
  reservationId: string;
  idempotencyKey: string;
  firstContent: NormalizedActionCoordinationFirstContent;
}) {
  return {
    actorId: options.actorId,
    idempotencyKey: options.idempotencyKey,
    operation: {
      method: "POST" as const,
      operationId: "activateCreatorGatedActionCoordination",
    },
    canonicalResource: {
      kind: "ACTION_RESERVATION",
      id: options.reservationId,
    },
    pathParameters: { reservationId: options.reservationId },
    body: { firstContent: options.firstContent },
  } as const;
}

function activationContextIdFromReceipt(value: Prisma.JsonValue | null): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const activation = (value as Prisma.JsonObject).activation;
  if (!activation || typeof activation !== "object" || Array.isArray(activation)) {
    return null;
  }
  const contextId = (activation as Prisma.JsonObject).contextId;
  return typeof contextId === "string" && contextId.length > 0
    ? contextId
    : null;
}

async function resourceFromContext(options: {
  contextId: string;
  actorId: string;
  source: DiscoveredActivationResource["source"];
  db: PrismaClient;
}): Promise<DiscoveredActivationResource | null> {
  const context = await options.db.actionCoordinationContext.findUnique({
    where: { id: options.contextId },
    select: {
      id: true,
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
  if (!context) return null;
  const creatorId = context.interest.classmatePost.userId;
  const responderId = context.interest.userId;
  if (creatorId !== options.actorId || responderId === options.actorId) {
    throw safetyUnavailable(404);
  }
  return Object.freeze({
    actionId: context.interest.classmatePostId,
    contextId: context.id,
    interestId: context.interest.id,
    creatorId,
    responderId,
    pair: [creatorId, responderId] as const,
    source: options.source,
  });
}

async function discoverActivationResource(options: {
  actorId: string;
  reservationId: string;
  idempotencyKey: string;
  firstContent: NormalizedActionCoordinationFirstContent;
  db: PrismaClient;
}): Promise<DiscoveredActivationResource | null> {
  const live = await options.db.actionCoordinationContext.findUnique({
    where: { reservationId: options.reservationId },
    select: { id: true },
  });
  if (live) {
    return resourceFromContext({
      contextId: live.id,
      actorId: options.actorId,
      source: "RESERVATION",
      db: options.db,
    });
  }

  // Successful activation clears reservationId. Resolve the same-key receipt
  // only far enough to recover the pair lock, then revalidate under that lock.
  const identity = buildActionCoordinationCommandIdentity(
    activationRequest(options),
  );
  const receipt = await options.db.apiIdempotencyRecord.findUnique({
    where: { id: identity.recordId },
    select: { responseBody: true },
  });
  const contextId = activationContextIdFromReceipt(receipt?.responseBody ?? null);
  if (!contextId) return null;
  return resourceFromContext({
    contextId,
    actorId: options.actorId,
    source: "RECEIPT",
    db: options.db,
  });
}

async function lockAction(
  tx: Prisma.TransactionClient,
  resource: DiscoveredActivationResource,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "ClassmatePost"
    WHERE "id" = ${resource.actionId} AND "userId" = ${resource.creatorId}
    FOR UPDATE
  `);
  if (!rows[0]) throw safetyUnavailable(404);
}

async function lockActivationGraph(
  tx: Prisma.TransactionClient,
  resource: DiscoveredActivationResource,
): Promise<ActivationGraph> {
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "ActionInterest"
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
      WHERE context."interestId" = ${resource.interestId}
      ORDER BY activation."id", context."id"
      FOR UPDATE OF activation, context
    `,
  );
  const graph = await tx.actionInterest.findUnique({
    where: { id: resource.interestId },
    select: activationGraphSelect,
  });
  if (
    !graph ||
    graph.userId !== resource.responderId ||
    graph.classmatePostId !== resource.actionId ||
    graph.classmatePost.userId !== resource.creatorId ||
    graph.coordinationContext?.id !== resource.contextId
  ) {
    throw safetyUnavailable(404);
  }
  return graph;
}

async function requireCurrentEligibility(
  tx: Prisma.TransactionClient,
  graph: ActivationGraph,
  now: Date,
): Promise<void> {
  const action = graph.classmatePost;
  if (actionPolicyTupleKind(action) !== "SNAPSHOTTED_CREATOR_GATED") {
    throw new ActionCoordinationFailure(
      "COORDINATION_POLICY_UNSUPPORTED",
      "This opportunity uses another coordination flow.",
      409,
    );
  }
  const origin = parseActionOriginSnapshot(graph.originSnapshot);
  if (
    !origin ||
    origin.kind !== "LIVE" ||
    origin.snapshot.sourceId !== action.id ||
    !origin.snapshot.participantIds.includes(graph.userId) ||
    !origin.snapshot.participantIds.includes(action.userId)
  ) {
    throw safetyUnavailable(404);
  }

  const [courses, pairBlock, moderationBlock] = await Promise.all([
    tx.userCourse.findMany({
      where: { userId: graph.userId, ...activeCourseMembershipWhere(now) },
      select: { courseId: true },
    }),
    tx.block.findFirst({
      where: {
        OR: [
          { blockerId: action.userId, blockedId: graph.userId },
          { blockerId: graph.userId, blockedId: action.userId },
        ],
      },
      select: { id: true },
    }),
    tx.moderationBlock.findFirst({
      where: { userId: { in: [action.userId, graph.userId] }, isActive: true },
      select: { id: true },
    }),
  ]);
  if (
    graph.status !== "ACTIVE" ||
    graph.user.isGuest ||
    !graph.user.onboardingComplete ||
    action.user.isGuest ||
    !action.user.onboardingComplete ||
    pairBlock ||
    moderationBlock
  ) {
    throw safetyUnavailable(404);
  }
  const responderCourseIds = new Set(courses.map((value) => value.courseId));
  const sharedCourse = action.courses.find((value) =>
    responderCourseIds.has(value.courseId),
  );
  const responderSchool = normalizeSchoolCode(graph.user.school);
  const creatorSchool = normalizeSchoolCode(action.user.school);
  const sameSchool =
    responderSchool !== null && responderSchool === creatorSchool;
  const visible =
    action.visibility === "CITY_INTERNATIONALS" ||
    (action.visibility === "VERIFIED_ONLY" && graph.user.verifiedStudent) ||
    (action.visibility === "SCHOOL_ONLY" && sameSchool) ||
    (action.visibility === "COURSEMATES_ONLY" && Boolean(sharedCourse));
  const courseEligible =
    action.category !== "SHARED_COURSES" ||
    (action.courses.length === 1 && Boolean(sharedCourse));
  if (!visible || !courseEligible) throw safetyUnavailable(404);
}

function requireActivatableAction(graph: ActivationGraph, now: Date): void {
  const action = graph.classmatePost;
  if (action.status === "REMOVED") throw safetyUnavailable(404);
  if (
    action.status === "EXPIRED" ||
    action.expiresAt.getTime() <= now.getTime() ||
    (action.endsAt !== null && action.endsAt.getTime() <= now.getTime())
  ) {
    throw new ActionCoordinationFailure(
      "ACTION_EXPIRED",
      "This opportunity has ended.",
      409,
    );
  }
  if (action.status === "FULFILLED" || action.fulfilledByPlanId !== null) {
    throw new ActionCoordinationFailure(
      "ACTION_FULFILLED",
      "This opportunity has already formed a plan.",
      409,
    );
  }
  if (action.status !== "ACTIVE" && action.status !== "CLOSED") {
    throw safetyUnavailable(404);
  }
}

async function requireNoActionablePlan(
  tx: Prisma.TransactionClient,
  actionId: string,
): Promise<void> {
  const pending = await tx.planCommitment.findFirst({
    where: {
      originActionId: actionId,
      currentPendingRevisionId: { not: null },
      status: { in: ["NEGOTIATING", "CONFIRMED"] },
    },
    select: { id: true },
    orderBy: { id: "asc" },
  });
  if (pending) {
    throw new ActionCoordinationFailure(
      "ACTION_PLAN_PENDING",
      "Resolve the current Action plan before starting another coordination.",
      409,
    );
  }
}

function assertCapability(capability: ActionCoordinationCapability): void {
  if (!capability.supported) {
    throw new ActionCoordinationFailure(
      "CLIENT_CAPABILITY_REQUIRED",
      "Update the app before starting this coordination.",
      426,
    );
  }
}

async function requireForwardEnrollment(
  graph: ActivationGraph,
  capability: ActionCoordinationCapability,
  tx: Prisma.TransactionClient,
  dependencies: ActionCoordinationActivationServiceDependencies,
): Promise<void> {
  assertCapability(capability);
  if (!(dependencies.enrollmentAllowed ?? isCreatorGatedExperimentEnrollmentEnabled)()) {
    throw safetyUnavailable(404);
  }
  const assignment = await (
    dependencies.resolveAssignment ??
    ((user, candidateCapability, candidateTx) =>
      getCreatorGatedActionToPlanAssignment(
        user,
        candidateCapability,
        candidateTx,
      ))
  )(graph.classmatePost.user, capability, tx);
  if (
    assignment.key !== CREATOR_GATED_ACTION_EXPERIMENT_KEY ||
    !assignment.eligible ||
    assignment.variant !== "TREATMENT"
  ) {
    throw safetyUnavailable(404);
  }
}

function sourceKind(category: ClassmatePostCategory): ProductFunnelSourceKind {
  return category === "SHARED_COURSES" ? "COURSE_ACTION" : "BUDDY_POST";
}

function funnelSurface(surface: ActionInterestSurface) {
  return surface === "FEED_CARD" ? "DISCOVER_EXPLORE" : "ACTION_DETAIL";
}

function normalizeFirstContent(
  input: ActionCoordinationFirstContentInput,
): NormalizedActionCoordinationFirstContent {
  if (input.type === "MESSAGE") {
    const body = input.body.trim();
    if (body.length === 0 || body.length > 500) {
      throw new ActionCoordinationFailure(
        "RESERVATION_INVALID",
        "The first message must contain 1–500 characters.",
        422,
      );
    }
    return Object.freeze({ type: "MESSAGE", body });
  }

  const title = input.title.trim();
  const location = input.location?.trim() || null;
  const message = input.message?.trim() || null;
  const start = new Date(input.startTime);
  const end = new Date(input.endTime);
  if (
    !ACTION_PLAN_TYPES.has(input.planType) ||
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
    type: "PLAN",
    planType: input.planType,
    title,
    location,
    message,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
  });
}

function requireFutureFirstPlan(
  firstContent: NormalizedActionCoordinationFirstContent,
  now: Date,
): void {
  if (
    firstContent.type === "PLAN" &&
    new Date(firstContent.startTime).getTime() <= now.getTime()
  ) {
    throw new ActionCoordinationFailure(
      "PLAN_TIME_PASSED",
      "Choose a Plan time in the future.",
      409,
    );
  }
}

async function replayRemainsSafe(
  tx: Prisma.TransactionClient,
  replay: ActionCoordinationReplayResponse<ActionCoordinationActivationEnvelopeDTO>,
): Promise<ActionCoordinationReplayResponse<ActionCoordinationActivationEnvelopeDTO>> {
  const body = replay.body;
  if (!body || typeof body !== "object" || !("activation" in body)) {
    return replay;
  }
  const activation = body.activation;
  if (!activation || typeof activation !== "object" || Array.isArray(activation)) {
    return actionCoordinationFailureResult(safetyUnavailable(404));
  }
  const contextId = (activation as Record<string, unknown>).contextId;
  if (typeof contextId !== "string" || contextId.length === 0) {
    return actionCoordinationFailureResult(safetyUnavailable(404));
  }
  const firstContentType = (activation as Record<string, unknown>)
    .firstContentType;
  const commitmentId = (activation as Record<string, unknown>).commitmentId;
  if (
    firstContentType !== "MESSAGE" &&
    !(
      firstContentType === "PLAN" &&
      typeof commitmentId === "string" &&
      commitmentId.length > 0
    )
  ) {
    return actionCoordinationFailureResult(safetyUnavailable(404));
  }
  const context = await tx.actionCoordinationContext.findUnique({
    where: { id: contextId },
    select: {
      connection: { select: { status: true } },
      interest: {
        select: {
          userId: true,
          originSnapshot: true,
          classmatePost: { select: { userId: true } },
        },
      },
    },
  });
  if (!context) return actionCoordinationFailureResult(safetyUnavailable(404));
  const creatorId = context.interest.classmatePost.userId;
  const responderId = context.interest.userId;
  const [pairBlock, moderationBlock] = await Promise.all([
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
      where: { userId: { in: [creatorId, responderId] }, isActive: true },
      select: { id: true },
    }),
  ]);
  const planCommitment =
    firstContentType === "PLAN"
      ? await tx.planCommitment.findUnique({
          where: { id: commitmentId as string },
          select: {
            connectionId: true,
            originContextId: true,
            participantAId: true,
            participantBId: true,
            safetyRestrictedAt: true,
          },
        })
      : null;
  const origin = parseActionOriginSnapshot(context.interest.originSnapshot);
  const planParticipants = planCommitment
    ? new Set([planCommitment.participantAId, planCommitment.participantBId])
    : null;
  if (
    origin?.kind !== "LIVE" ||
    pairBlock ||
    moderationBlock ||
    context.connection?.status === "BLOCKED" ||
    (firstContentType === "PLAN" &&
      (!planCommitment ||
        planCommitment.connectionId !==
          (activation as Record<string, unknown>).connectionId ||
        planCommitment.originContextId !== contextId ||
        planCommitment.safetyRestrictedAt !== null ||
        planParticipants?.size !== 2 ||
        !planParticipants.has(creatorId) ||
        !planParticipants.has(responderId)))
  ) {
    return actionCoordinationFailureResult(safetyUnavailable(404));
  }
  return replay;
}

export async function activateCreatorGatedActionCoordination(options: {
  actorId: string;
  reservationId: string;
  idempotencyKey: string;
  capability: ActionCoordinationCapability;
  firstContent: ActionCoordinationFirstContentInput;
  dependencies?: ActionCoordinationActivationServiceDependencies;
}): Promise<ActionCoordinationActivationMutationResult> {
  const firstContent = normalizeFirstContent(options.firstContent);
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  const discovered = await discoverActivationResource({
    actorId: options.actorId,
    reservationId: options.reservationId,
    idempotencyKey: options.idempotencyKey,
    firstContent,
    db,
  });
  if (discovered?.source === "RESERVATION") {
    const finalize = dependencies.finalizeExpiry ?? finalizeActionExpiry;
    await finalize(discovered.actionId, {
      db,
      clock: dependencies.clock,
      transactionOptions: dependencies.transactionOptions,
    });
  }

  return runAtomicActionCoordinationCommand(
    {
      request: activationRequest({
        actorId: options.actorId,
        reservationId: options.reservationId,
        idempotencyKey: options.idempotencyKey,
        firstContent,
      }),
      pairs: discovered ? [discovered.pair] : [],
      refreshReplay: async (context, replay) =>
        replayRemainsSafe(context.tx, replay),
      execute: async (context) => {
        if (!discovered) throw safetyUnavailable(404);
        await lockAction(context.tx, discovered);
        const graph = await lockActivationGraph(context.tx, discovered);
        const coordination = graph.coordinationContext;
        const activation = coordination?.currentActivation;
        if (
          !coordination ||
          !activation ||
          coordination.currentActivationId !== activation.id ||
          activation.interestId !== graph.id ||
          activation.connectedAt !== null ||
          activation.firstContentType !== null ||
          activation.terminalReason !== null
        ) {
          throw new ActionCoordinationFailure(
            "CONTEXT_ENDED",
            "This response can no longer start a coordination.",
            409,
          );
        }
        if (
          coordination.state !== "INITIATING" ||
          coordination.reservationId !== options.reservationId ||
          coordination.leaseExpiresAt === null
        ) {
          throw new ActionCoordinationFailure(
            "RESERVATION_INVALID",
            "This coordination shell is no longer active.",
            409,
          );
        }
        if (coordination.leaseExpiresAt.getTime() <= context.now.getTime()) {
          await releaseInitiatingReservationInTransaction(
            context,
            coordination.id,
            {
              expectedReservationId: options.reservationId,
              expectedCreatorId: options.actorId,
              onlyWhenExpired: true,
            },
          );
          throw new ActionCoordinationFailure(
            "RESERVATION_EXPIRED",
            "This coordination shell expired. Preserve the draft and try again.",
            409,
          );
        }

        await requireCurrentEligibility(context.tx, graph, context.now);
        requireActivatableAction(graph, context.now);
        await requireForwardEnrollment(
          graph,
          options.capability,
          context.tx,
          dependencies,
        );
        await requireNoActionablePlan(context.tx, graph.classmatePostId);
        requireFutureFirstPlan(firstContent, context.now);
        if (graph.connectionId !== null || coordination.connectionId !== null) {
          throw new ActionCoordinationFailure(
            "RESERVATION_INVALID",
            "This coordination shell has conflicting connection state.",
            409,
          );
        }

        try {
          return await withCanonicalConnectionScope(
            context.tx,
            discovered.creatorId,
            discovered.responderId,
            async (scope) => {
              const connection = scope.existing
                ? scope.existing.status === "ACTIVE"
                  ? { ...scope.existing, created: false }
                  : null
                : await scope.createActive({
                    originCourseId:
                      graph.classmatePost.category === "SHARED_COURSES" &&
                      graph.classmatePost.courses.length === 1
                        ? graph.classmatePost.courses[0]!.courseId
                        : null,
                  });
              if (!connection) throw safetyUnavailable(404);

              const sourceCardAt = new Date(context.now.getTime());
              const firstContentAt = new Date(context.now.getTime() + 1);
              // An expected reply-gate rejection is converted into a persisted
              // command receipt below. Run the gate before any source-card write
              // so that committing that receipt cannot also commit a partial
              // activation. Both first-content writers repeat this check while
              // holding the same Connection row lock; ACTION_INTEREST_CARD is
              // deliberately excluded from the human-send gate.
              await assertDirectUnrepliedSendAllowed(context.tx, {
                connectionId: connection.id,
                senderId: discovered.creatorId,
              });
              const sourceCard = await context.tx.message.create({
                data: {
                  connectionId: connection.id,
                  senderId: discovered.responderId,
                  body: "",
                  type: MessageType.ACTION_INTEREST_CARD,
                  actionInterestId: graph.id,
                  actionContextId: coordination.id,
                  createdAt: sourceCardAt,
                },
                select: { id: true },
              });

              let activationResult: MessageActivationDTO | PlanActivationDTO;
              if (firstContent.type === "MESSAGE") {
                const firstMessage = await createDirectMessageRecord(context.tx, {
                  connectionId: connection.id,
                  senderId: discovered.creatorId,
                  input: {
                    type: "TEXT",
                    body: firstContent.body,
                    actionContextId: coordination.id,
                  },
                  createdAt: firstContentAt,
                });
                activationResult = {
                  connectionId: connection.id,
                  contextId: coordination.id,
                  sourceCardMessageId: sourceCard.id,
                  firstMessageId: firstMessage.message.id,
                  firstContentType: "MESSAGE",
                  focus: {
                    type: "ACTION_CONTEXT",
                    connectionId: connection.id,
                    contextId: coordination.id,
                  },
                };
              } else {
                const createdPlan = await createInitialActionPlanInTransaction(
                  context,
                  {
                    actorId: discovered.creatorId,
                    resource: {
                      actionId: discovered.actionId,
                      interestId: discovered.interestId,
                      contextId: discovered.contextId,
                      connectionId: connection.id,
                      creatorId: discovered.creatorId,
                      responderId: discovered.responderId,
                      pair: discovered.pair,
                    },
                    input: {
                      planType: firstContent.planType,
                      title: firstContent.title,
                      location: firstContent.location,
                      message: firstContent.message,
                      startTime: firstContent.startTime,
                      endTime: firstContent.endTime,
                    },
                    allowInitiatingContext: true,
                    messageCreatedAt: firstContentAt,
                  },
                );
                activationResult = {
                  connectionId: connection.id,
                  contextId: coordination.id,
                  sourceCardMessageId: sourceCard.id,
                  planCardMessageId: createdPlan.messageId,
                  commitmentId: createdPlan.commitmentId,
                  revisionId: createdPlan.revisionId,
                  firstContentType: "PLAN",
                  focus: {
                    type: "PLAN",
                    connectionId: connection.id,
                    commitmentId: createdPlan.commitmentId,
                    revisionId: createdPlan.revisionId,
                  },
                };
              }

              await context.tx.actionInterest.update({
                where: { id: graph.id },
                data: { connectionId: connection.id, updatedAt: firstContentAt },
              });
              await context.tx.actionCoordinationContext.update({
                where: { id: coordination.id },
                data: {
                  state: "OPEN",
                  connectionId: connection.id,
                  activatedAt: firstContentAt,
                  reservationId: null,
                  leaseExpiresAt: null,
                  updatedAt: firstContentAt,
                },
              });
              await context.tx.actionInterestActivation.update({
                where: { id: activation.id },
                data: {
                  connectedAt: firstContentAt,
                  firstContentType: firstContent.type,
                },
              });

              const eventKey = businessFunnelEventKeys.actionConnected(
                activation.id,
              );
              await recordServerFunnelEvent(context.tx, {
                businessEventKey: eventKey,
                actorId: discovered.creatorId,
                name: "ACTION_CONNECTED",
                surface: funnelSurface(activation.interestSurface),
                sourceKind: sourceKind(graph.classmatePost.category),
                sourceId: graph.classmatePostId,
                connectionId: connection.id,
                actionInterestId: graph.id,
                interestActivationId: activation.id,
                actionContextId: coordination.id,
                interestSurface: activation.interestSurface,
                firstContentType: firstContent.type,
                coordinationPolicy: "CREATOR_GATED_V2",
                policySchemaVersion: ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
                experimentKey: graph.classmatePost.experimentKeySnapshot!,
                experimentVariant:
                  graph.classmatePost.experimentVariantSnapshot!,
                occurredAt: firstContentAt,
              });
              if (firstContent.type === "MESSAGE") {
                await enqueueNotificationOutboxItem(context.tx, {
                  kind: "ACTION_CONNECTED",
                  recipientId: discovered.responderId,
                  sourceKey:
                    notificationOutboxSourceKeys.forBusinessEvent(eventKey),
                  destination: {
                    type: "ACTION_CONTEXT",
                    connectionId: connection.id,
                    contextId: coordination.id,
                  },
                  availableAt: firstContentAt,
                });
              }

              return {
                status: 201,
                body: {
                  activation: activationResult,
                },
              };
            },
          );
        } catch (cause) {
          if (cause instanceof CanonicalConnectionIntegrityError) {
            throw safetyUnavailable(404);
          }
          if (cause instanceof PeerReplyRequiredError) {
            throw new ActionCoordinationFailure(
              "PEER_REPLY_REQUIRED",
              cause.message,
              403,
            );
          }
          throw cause;
        }
      },
    },
    {
      db,
      clock: dependencies.clock,
      transactionOptions: dependencies.transactionOptions,
    },
  );
}
