import "server-only";

import { randomUUID } from "node:crypto";

import {
  type ActionInterestSurface,
  type ClassmatePostCategory,
  type ExperimentVariant,
  Prisma,
  type PrismaClient,
  type ProductFunnelSourceKind,
} from "@prisma/client";

import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { normalizeSchoolCode } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { parseActionOriginSnapshot } from "@/lib/v2/action-context-snapshot";
import {
  ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
  type ActionCoordinationCapability,
} from "@/lib/v2/action-coordination/capability";
import {
  runAtomicActionCoordinationCommand,
  type ActionCoordinationAtomicCommandResult,
  type ActionCoordinationClock,
  type ActionCoordinationReplayResponse,
  type ActionCoordinationTransactionOptions,
} from "@/lib/v2/action-coordination/command";
import type {
  ActionCoordinationJsonObject,
  CoordinationShellRouteFocus,
} from "@/lib/v2/action-coordination/dto";
import {
  ActionCoordinationFailure,
  safetyUnavailable,
} from "@/lib/v2/action-coordination/errors";
import {
  actionPolicyTupleKind,
  CREATOR_GATED_ACTION_EXPERIMENT_KEY,
} from "@/lib/v2/action-coordination/policy-snapshot";
import {
  finalizeActionExpiry,
  recoverExpiredReservationLeaseInTransaction,
  releaseInitiatingReservationInTransaction,
  type ActionLifecycleFinalizerDependencies,
} from "@/lib/v2/action-lifecycle-finalizer";
import { getCreatorGatedActionToPlanAssignment } from "@/lib/v2/experiments";
import { isCreatorGatedExperimentEnrollmentEnabled } from "@/lib/v2/feature-flags";
import { actionCoordinationFailureResult } from "@/lib/v2/action-coordination/route-adapter";
import {
  businessFunnelEventKeys,
  recordServerFunnelEvent,
} from "@/lib/v2/funnel-events";

export const DEFAULT_COORDINATION_RESERVATION_LEASE_MS = 5 * 60_000;

type LiveActionContextPreviewDTO = ActionCoordinationJsonObject & {
  kind: "LIVE";
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  location: string | null;
  course:
    | (ActionCoordinationJsonObject & {
        id: string;
        code: string | null;
        name: string;
      })
    | null;
};

type LiveReservationPlanDraftDTO = ActionCoordinationJsonObject & {
  kind: "LIVE";
  title: string;
  startTime: string | null;
  endTime: string | null;
  location: string | null;
  planType: "STUDY" | "MEAL" | "SPORTS" | "LANGUAGE" | "CUSTOM";
};

export type ActionCoordinationReservationDTO = ActionCoordinationJsonObject & {
  id: string;
  contextId: string;
  leaseExpiresAt: string;
  generation: number;
  actionContextPreview: LiveActionContextPreviewDTO;
  planDraft: LiveReservationPlanDraftDTO;
  focus: CoordinationShellRouteFocus & ActionCoordinationJsonObject;
};

export type ActionCoordinationReservationEnvelopeDTO =
  ActionCoordinationJsonObject & {
    reservation: ActionCoordinationReservationDTO;
  };

export type ActionCoordinationReservationReleaseDTO =
  ActionCoordinationJsonObject & {
    reservationId: string;
    contextId: string;
    interestId: string;
    actionId: string;
    generation: number;
    releasedAt: string;
    focus: ActionCoordinationJsonObject & {
      type: "ACTION_RESPONSES";
      actionId: string;
      interestId: string;
    };
  };

export type ActionCoordinationReservationReleaseEnvelopeDTO =
  ActionCoordinationJsonObject & {
    release: ActionCoordinationReservationReleaseDTO;
  };

export type ActionCoordinationReservationMutationResult =
  ActionCoordinationAtomicCommandResult<ActionCoordinationReservationEnvelopeDTO>;
export type ActionCoordinationReservationReleaseMutationResult =
  ActionCoordinationAtomicCommandResult<ActionCoordinationReservationReleaseEnvelopeDTO>;

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

export type ActionCoordinationReservationServiceDependencies = Readonly<{
  db?: PrismaClient;
  clock?: ActionCoordinationClock;
  transactionOptions?: ActionCoordinationTransactionOptions;
  enrollmentAllowed?: () => boolean;
  resolveAssignment?: AssignmentResolver;
  finalizeExpiry?: (
    actionId: string,
    dependencies: ActionLifecycleFinalizerDependencies,
  ) => ReturnType<typeof finalizeActionExpiry>;
  leaseDurationMs?: number;
  reservationIdFactory?: () => string;
}>;

const reservationGraphSelect = Prisma.validator<Prisma.ActionInterestSelect>()({
  id: true,
  userId: true,
  classmatePostId: true,
  status: true,
  originSnapshot: true,
  user: {
    select: {
      id: true,
      username: true,
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
          terminalReason: true,
        },
      },
    },
  },
});

type ReservationGraph = Prisma.ActionInterestGetPayload<{
  select: typeof reservationGraphSelect;
}>;

type DiscoveredReservationResource = Readonly<{
  actionId: string;
  contextId: string;
  interestId: string;
  creatorId: string;
  responderId: string;
  pair: readonly [string, string];
}>;

function database(dependencies: ActionCoordinationReservationServiceDependencies) {
  return dependencies.db ?? prisma;
}

function leaseDuration(
  dependencies: ActionCoordinationReservationServiceDependencies,
): number {
  const value =
    dependencies.leaseDurationMs ?? DEFAULT_COORDINATION_RESERVATION_LEASE_MS;
  if (!Number.isSafeInteger(value) || value < 30_000 || value > 30 * 60_000) {
    throw new TypeError("Reservation lease duration must be 30 seconds to 30 minutes.");
  }
  return value;
}

function reservationId(
  dependencies: ActionCoordinationReservationServiceDependencies,
): string {
  const value = (dependencies.reservationIdFactory ?? randomUUID)();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new TypeError("Reservation identifiers must be RFC 4122 UUIDs.");
  }
  return value;
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
  graph: ReservationGraph,
  capability: ActionCoordinationCapability,
  tx: Prisma.TransactionClient,
  dependencies: ActionCoordinationReservationServiceDependencies,
): Promise<void> {
  assertCapability(capability);
  if (!(dependencies.enrollmentAllowed ?? isCreatorGatedExperimentEnrollmentEnabled)()) {
    throw safetyUnavailable(404);
  }
  const creator = graph.classmatePost.user;
  const assignment = await (
    dependencies.resolveAssignment ??
    ((user, candidateCapability, candidateTx) =>
      getCreatorGatedActionToPlanAssignment(
        user,
        candidateCapability,
        candidateTx,
      ))
  )(creator, capability, tx);
  if (
    assignment.key !== CREATOR_GATED_ACTION_EXPERIMENT_KEY ||
    !assignment.eligible ||
    assignment.variant !== "TREATMENT"
  ) {
    throw safetyUnavailable(404);
  }
}

async function discoverInterestForCreator(
  interestId: string,
  actorId: string,
  db: PrismaClient,
): Promise<DiscoveredReservationResource> {
  const interest = await db.actionInterest.findUnique({
    where: { id: interestId },
    select: {
      userId: true,
      classmatePostId: true,
      coordinationContext: { select: { id: true } },
      classmatePost: { select: { userId: true } },
    },
  });
  if (
    !interest ||
    !interest.coordinationContext ||
    interest.classmatePost.userId !== actorId ||
    interest.userId === actorId
  ) {
    throw safetyUnavailable(404);
  }
  return Object.freeze({
    actionId: interest.classmatePostId,
    contextId: interest.coordinationContext.id,
    interestId,
    creatorId: actorId,
    responderId: interest.userId,
    pair: [actorId, interest.userId] as const,
  });
}

async function discoverReservationForCreator(
  value: string,
  actorId: string,
  db: PrismaClient,
): Promise<DiscoveredReservationResource | null> {
  const context = await db.actionCoordinationContext.findUnique({
    where: { reservationId: value },
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
  if (
    context.interest.classmatePost.userId !== actorId ||
    context.interest.userId === actorId
  ) {
    throw safetyUnavailable(404);
  }
  return Object.freeze({
    actionId: context.interest.classmatePostId,
    contextId: context.id,
    interestId: context.interest.id,
    creatorId: actorId,
    responderId: context.interest.userId,
    pair: [actorId, context.interest.userId] as const,
  });
}

async function runExpiryPreflight(
  actionId: string,
  dependencies: ActionCoordinationReservationServiceDependencies,
): Promise<void> {
  const finalize = dependencies.finalizeExpiry ?? finalizeActionExpiry;
  await finalize(actionId, {
    db: database(dependencies),
    clock: dependencies.clock,
    transactionOptions: dependencies.transactionOptions,
  });
}

async function lockAction(
  tx: Prisma.TransactionClient,
  actionId: string,
  creatorId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "ClassmatePost"
    WHERE "id" = ${actionId} AND "userId" = ${creatorId}
    FOR UPDATE
  `);
  if (!rows[0]) throw safetyUnavailable(404);
}

async function lockInterestGraph(
  tx: Prisma.TransactionClient,
  resource: DiscoveredReservationResource,
): Promise<ReservationGraph> {
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
    select: reservationGraphSelect,
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
  graph: ReservationGraph,
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

function requireReservableAction(graph: ReservationGraph, now: Date): void {
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

function maxActiveCoordinations(graph: ReservationGraph): number {
  const value = graph.classmatePost.policyParametersSnapshot;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ActionCoordinationFailure(
      "COORDINATION_POLICY_UNSUPPORTED",
      "This opportunity has an invalid coordination policy.",
      409,
    );
  }
  const cap = value.maxActiveCoordinations;
  if (!Number.isSafeInteger(cap) || (cap as number) < 1 || (cap as number) > 10) {
    throw new ActionCoordinationFailure(
      "COORDINATION_POLICY_UNSUPPORTED",
      "This opportunity has an invalid coordination policy.",
      409,
    );
  }
  return cap as number;
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

function sourceKind(category: ClassmatePostCategory): ProductFunnelSourceKind {
  return category === "SHARED_COURSES" ? "COURSE_ACTION" : "BUDDY_POST";
}

function funnelSurface(surface: ActionInterestSurface) {
  return surface === "FEED_CARD" ? "DISCOVER_EXPLORE" : "ACTION_DETAIL";
}

function reservationPreview(
  graph: ReservationGraph,
  now: Date,
): Readonly<{
  actionContextPreview: LiveActionContextPreviewDTO;
  planDraft: LiveReservationPlanDraftDTO;
}> {
  const origin = parseActionOriginSnapshot(graph.originSnapshot);
  if (
    !origin ||
    origin.kind !== "LIVE" ||
    origin.snapshot.sourceId !== graph.classmatePostId ||
    !origin.snapshot.participantIds.includes(graph.userId) ||
    !origin.snapshot.participantIds.includes(graph.classmatePost.userId)
  ) {
    throw safetyUnavailable(404);
  }
  const start = origin.snapshot.startsAt
    ? new Date(origin.snapshot.startsAt)
    : null;
  const inheritTime = start !== null && start.getTime() > now.getTime();
  return Object.freeze({
    actionContextPreview: {
      kind: "LIVE",
      title: origin.snapshot.title,
      startsAt: origin.snapshot.startsAt,
      endsAt: origin.snapshot.endsAt,
      location: origin.snapshot.location,
      course: origin.snapshot.course,
    },
    planDraft: {
      kind: "LIVE",
      title: origin.snapshot.title,
      startTime: inheritTime ? origin.snapshot.startsAt : null,
      endTime: inheritTime ? origin.snapshot.endsAt : null,
      location: origin.snapshot.location,
      planType: origin.snapshot.planType,
    },
  });
}

function reservationEnvelope(options: {
  graph: ReservationGraph;
  now: Date;
  id: string;
  generation: number;
  leaseExpiresAt: Date;
}): ActionCoordinationReservationEnvelopeDTO {
  const context = options.graph.coordinationContext;
  if (!context) throw safetyUnavailable(404);
  const preview = reservationPreview(options.graph, options.now);
  return {
    reservation: {
      id: options.id,
      contextId: context.id,
      leaseExpiresAt: options.leaseExpiresAt.toISOString(),
      generation: options.generation,
      ...preview,
      focus: {
        type: "COORDINATION_SHELL",
        interestId: options.graph.id,
        reservationId: options.id,
      },
    },
  };
}

function mutationRequest(options: {
  actorId: string;
  idempotencyKey: string;
  method: "POST" | "DELETE";
  operationId: string;
  resourceKind: "ACTION_INTEREST" | "ACTION_RESERVATION";
  resourceId: string;
}) {
  const pathParameters: ActionCoordinationJsonObject =
    options.resourceKind === "ACTION_INTEREST"
      ? { interestId: options.resourceId }
      : { reservationId: options.resourceId };
  return {
    actorId: options.actorId,
    idempotencyKey: options.idempotencyKey,
    operation: { method: options.method, operationId: options.operationId },
    canonicalResource: { kind: options.resourceKind, id: options.resourceId },
    pathParameters,
    body: null,
  } as const;
}

function refreshPrivacySafeReservationReplay(
  replay: ActionCoordinationReplayResponse<ActionCoordinationReservationEnvelopeDTO>,
): ActionCoordinationReplayResponse<ActionCoordinationReservationEnvelopeDTO> {
  const body = replay.body;
  if (
    body &&
    typeof body === "object" &&
    "reservation" in body &&
    body.reservation &&
    typeof body.reservation === "object" &&
    !Array.isArray(body.reservation)
  ) {
    const reservation = body.reservation as Record<string, unknown>;
    const preview = reservation.actionContextPreview;
    const draft = reservation.planDraft;
    const isTombstone = (value: unknown) =>
      Boolean(
        value &&
          typeof value === "object" &&
          !Array.isArray(value) &&
          (value as { kind?: unknown }).kind === "TOMBSTONE",
      );
    if (isTombstone(preview) || isTombstone(draft)) {
      return actionCoordinationFailureResult(safetyUnavailable(404));
    }
  }
  return replay;
}

async function loadLockedGraph(
  tx: Prisma.TransactionClient,
  resource: DiscoveredReservationResource,
): Promise<ReservationGraph> {
  await lockAction(tx, resource.actionId, resource.creatorId);
  return lockInterestGraph(tx, resource);
}

export async function reserveCreatorGatedActionCoordination(options: {
  actorId: string;
  interestId: string;
  idempotencyKey: string;
  capability: ActionCoordinationCapability;
  dependencies?: ActionCoordinationReservationServiceDependencies;
}): Promise<ActionCoordinationReservationMutationResult> {
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  const discovered = await discoverInterestForCreator(
    options.interestId,
    options.actorId,
    db,
  );
  await runExpiryPreflight(discovered.actionId, dependencies);
  const leaseMs = leaseDuration(dependencies);
  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: "POST",
        operationId: "reserveCreatorGatedActionCoordination",
        resourceKind: "ACTION_INTEREST",
        resourceId: options.interestId,
      }),
      pairs: [discovered.pair],
      refreshReplay: async (_context, replay) =>
        refreshPrivacySafeReservationReplay(replay),
      execute: async (context) => {
        let graph = await loadLockedGraph(context.tx, discovered);
        await requireCurrentEligibility(context.tx, graph, context.now);
        requireReservableAction(graph, context.now);
        await requireForwardEnrollment(
          graph,
          options.capability,
          context.tx,
          dependencies,
        );
        const coordination = graph.coordinationContext;
        const activation = coordination?.currentActivation;
        if (
          !coordination ||
          !activation ||
          coordination.currentActivationId !== activation.id ||
          activation.interestId !== graph.id ||
          activation.connectedAt !== null ||
          activation.terminalReason !== null
        ) {
          throw new ActionCoordinationFailure(
            "CONTEXT_ENDED",
            "This response can no longer start a coordination.",
            409,
          );
        }

        if (
          coordination.state === "INITIATING" &&
          coordination.leaseExpiresAt !== null &&
          coordination.leaseExpiresAt.getTime() <= context.now.getTime()
        ) {
          await recoverExpiredReservationLeaseInTransaction(
            context,
            coordination.id,
          );
          graph = await lockInterestGraph(context.tx, discovered);
        }

        const current = graph.coordinationContext;
        if (!current) throw safetyUnavailable(404);
        await requireNoActionablePlan(context.tx, graph.classmatePostId);

        if (current.state === "INITIATING") {
          if (!current.reservationId || !current.leaseExpiresAt) {
            throw new ActionCoordinationFailure(
              "RESERVATION_INVALID",
              "The existing coordination shell is invalid.",
              409,
            );
          }
          const activeCount = await context.tx.actionCoordinationContext.count({
            where: {
              interest: { classmatePostId: graph.classmatePostId },
              state: { in: ["INITIATING", "OPEN"] },
            },
          });
          if (activeCount > maxActiveCoordinations(graph)) {
            throw new ActionCoordinationFailure(
              "COORDINATION_LIMIT_REACHED",
              "Resolve an active coordination before starting another.",
              409,
            );
          }
          const leaseExpiresAt = new Date(context.now.getTime() + leaseMs);
          await context.tx.actionCoordinationContext.update({
            where: { id: current.id },
            data: { leaseExpiresAt, updatedAt: context.now },
          });
          return {
            status: 200,
            body: reservationEnvelope({
              graph,
              now: context.now,
              id: current.reservationId,
              generation: current.reservationGeneration,
              leaseExpiresAt,
            }),
          };
        }
        if (current.state === "OPEN") {
          throw new ActionCoordinationFailure(
            "INTEREST_ALREADY_COORDINATING",
            "This response is already coordinating.",
            409,
          );
        }
        if (current.state !== "WAITING") {
          throw new ActionCoordinationFailure(
            "CONTEXT_ENDED",
            "This response can no longer start a coordination.",
            409,
          );
        }

        const activeCount = await context.tx.actionCoordinationContext.count({
          where: {
            interest: { classmatePostId: graph.classmatePostId },
            state: { in: ["INITIATING", "OPEN"] },
          },
        });
        if (activeCount >= maxActiveCoordinations(graph)) {
          throw new ActionCoordinationFailure(
            "COORDINATION_LIMIT_REACHED",
            "Resolve an active coordination before starting another.",
            409,
          );
        }

        const id = reservationId(dependencies);
        const generation = current.reservationGeneration + 1;
        const leaseExpiresAt = new Date(context.now.getTime() + leaseMs);
        await context.tx.actionCoordinationContext.update({
          where: { id: current.id },
          data: {
            state: "INITIATING",
            reservationId: id,
            reservationGeneration: generation,
            leaseExpiresAt,
            updatedAt: context.now,
          },
        });
        await recordServerFunnelEvent(context.tx, {
          businessEventKey: businessFunnelEventKeys.coordinationReserved(
            current.id,
            generation,
          ),
          actorId: options.actorId,
          name: "COORDINATION_RESERVED",
          surface: funnelSurface(activation.interestSurface),
          sourceKind: sourceKind(graph.classmatePost.category),
          sourceId: graph.classmatePostId,
          actionInterestId: graph.id,
          interestActivationId: activation.id,
          actionContextId: current.id,
          coordinationPolicy: "CREATOR_GATED_V2",
          policySchemaVersion: ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
          experimentKey: graph.classmatePost.experimentKeySnapshot!,
          experimentVariant: graph.classmatePost.experimentVariantSnapshot!,
          occurredAt: context.now,
        });
        return {
          status: 201,
          body: reservationEnvelope({
            graph,
            now: context.now,
            id,
            generation,
            leaseExpiresAt,
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

export async function releaseCreatorGatedActionCoordinationReservation(options: {
  actorId: string;
  reservationId: string;
  idempotencyKey: string;
  dependencies?: ActionCoordinationReservationServiceDependencies;
}): Promise<ActionCoordinationReservationReleaseMutationResult> {
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  const discovered = await discoverReservationForCreator(
    options.reservationId,
    options.actorId,
    db,
  );
  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: "DELETE",
        operationId: "releaseCreatorGatedActionCoordinationReservation",
        resourceKind: "ACTION_RESERVATION",
        resourceId: options.reservationId,
      }),
      pairs: discovered ? [discovered.pair] : [],
      execute: async (context) => {
        if (!discovered) throw safetyUnavailable(404);
        const released = await releaseInitiatingReservationInTransaction(
          context,
          discovered.contextId,
          {
            expectedReservationId: options.reservationId,
            expectedCreatorId: options.actorId,
          },
        );
        if (released.kind !== "applied") {
          throw new ActionCoordinationFailure(
            "RESERVATION_INVALID",
            "This coordination shell is no longer active.",
            409,
          );
        }
        return {
          status: 200,
          body: {
            release: {
              reservationId: options.reservationId,
              contextId: discovered.contextId,
              interestId: discovered.interestId,
              actionId: discovered.actionId,
              generation: released.value.reservationGeneration,
              releasedAt: released.value.releasedAt.toISOString(),
              focus: {
                type: "ACTION_RESPONSES",
                actionId: discovered.actionId,
                interestId: discovered.interestId,
              },
            },
          },
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

export async function heartbeatCreatorGatedActionCoordinationReservation(options: {
  actorId: string;
  reservationId: string;
  idempotencyKey: string;
  capability: ActionCoordinationCapability;
  dependencies?: ActionCoordinationReservationServiceDependencies;
}): Promise<ActionCoordinationReservationMutationResult> {
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  const discovered = await discoverReservationForCreator(
    options.reservationId,
    options.actorId,
    db,
  );
  if (discovered) await runExpiryPreflight(discovered.actionId, dependencies);
  const leaseMs = leaseDuration(dependencies);
  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: "POST",
        operationId: "heartbeatCreatorGatedActionCoordinationReservation",
        resourceKind: "ACTION_RESERVATION",
        resourceId: options.reservationId,
      }),
      pairs: discovered ? [discovered.pair] : [],
      refreshReplay: async (_context, replay) =>
        refreshPrivacySafeReservationReplay(replay),
      execute: async (context) => {
        if (!discovered) throw safetyUnavailable(404);
        const graph = await loadLockedGraph(context.tx, discovered);
        const coordination = graph.coordinationContext;
        if (
          !coordination ||
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
        requireReservableAction(graph, context.now);
        await requireForwardEnrollment(
          graph,
          options.capability,
          context.tx,
          dependencies,
        );
        try {
          await requireNoActionablePlan(context.tx, graph.classmatePostId);
        } catch (cause) {
          if (
            cause instanceof ActionCoordinationFailure &&
            cause.code === "ACTION_PLAN_PENDING"
          ) {
            await releaseInitiatingReservationInTransaction(
              context,
              coordination.id,
              {
                expectedReservationId: options.reservationId,
                expectedCreatorId: options.actorId,
              },
            );
          }
          throw cause;
        }
        const leaseExpiresAt = new Date(context.now.getTime() + leaseMs);
        await context.tx.actionCoordinationContext.update({
          where: { id: coordination.id },
          data: { leaseExpiresAt, updatedAt: context.now },
        });
        return {
          status: 200,
          body: reservationEnvelope({
            graph,
            now: context.now,
            id: options.reservationId,
            generation: coordination.reservationGeneration,
            leaseExpiresAt,
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
