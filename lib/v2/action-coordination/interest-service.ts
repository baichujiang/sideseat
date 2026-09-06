import "server-only";

import { createHash } from "node:crypto";

import {
  type ActionCoordinationState,
  type ActionInterestSurface,
  type ActionInterestTerminalReason,
  type ClassmatePostCategory,
  type ClassmatePostStatus,
  type ExperimentVariant,
  type PlanType,
  Prisma,
  type PrismaClient,
  type ProductFunnelSourceKind,
} from "@prisma/client";

import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { normalizeSchoolCode } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import {
  parseActionContextSnapshot,
  parseActionOriginSnapshot,
  type ActionContextSnapshot,
} from "@/lib/v2/action-context-snapshot";
import {
  type ActionCoordinationCapability,
  ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
} from "@/lib/v2/action-coordination/capability";
import {
  runAtomicActionCoordinationCommand,
  type ActionCoordinationAtomicCommandResult,
  type ActionCoordinationClock,
  type ActionCoordinationReplayResponse,
  type ActionCoordinationTransactionContext,
  type ActionCoordinationTransactionOptions,
} from "@/lib/v2/action-coordination/command";
import type {
  ActionContextRouteFocus,
  ActionCoordinationJsonObject,
  ActionCoordinationJsonValue,
  InterestRouteFocus,
  PlanRouteFocus,
} from "@/lib/v2/action-coordination/dto";
import {
  ActionCoordinationConflict,
  ActionCoordinationFailure,
  safetyUnavailable,
} from "@/lib/v2/action-coordination/errors";
import {
  actionPolicyTupleKind,
  CREATOR_GATED_ACTION_EXPERIMENT_KEY,
} from "@/lib/v2/action-coordination/policy-snapshot";
import {
  finalizeActionExpiry,
  type ActionLifecycleFinalizerDependencies,
} from "@/lib/v2/action-lifecycle-finalizer";
import {
  getCreatorGatedActionToPlanAssignment,
} from "@/lib/v2/experiments";
import {
  isCreatorGatedExperimentEnrollmentEnabled,
} from "@/lib/v2/feature-flags";
import {
  businessFunnelEventKeys,
  recordServerFunnelEvent,
} from "@/lib/v2/funnel-events";
import {
  enqueueNotificationOutboxItem,
  notificationOutboxSourceKeys,
} from "@/lib/v2/notification-outbox-producer";

const DEFAULT_MY_INTERESTS_LIMIT = 50;
const INTEREST_ACTIVATION_RATE_LIMIT = 3;
const INTEREST_ACTIVATION_RATE_WINDOW_MS = 10 * 60_000;

const gatedInterestSelect = Prisma.validator<Prisma.ActionInterestSelect>()({
  id: true,
  userId: true,
  classmatePostId: true,
  connectionId: true,
  status: true,
  originSnapshot: true,
  withdrawnAt: true,
  createdAt: true,
  updatedAt: true,
  classmatePost: {
    select: {
      id: true,
      userId: true,
      status: true,
      expiresAt: true,
      coordinationPolicy: true,
      policySchemaVersion: true,
      policyParametersSnapshot: true,
      experimentKeySnapshot: true,
      experimentVariantSnapshot: true,
      clientCapabilitySnapshot: true,
      policySnapshottedAt: true,
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
      activatedAt: true,
      endedAt: true,
      createdAt: true,
      updatedAt: true,
      currentActivation: {
        select: {
          id: true,
          interestId: true,
          ordinal: true,
          interestSurface: true,
          startedAt: true,
          connectedAt: true,
          firstContentType: true,
          terminalReason: true,
          terminalAt: true,
        },
      },
      originPlanCommitments: {
        where: {
          OR: [
            { currentPendingRevisionId: { not: null } },
            { currentAcceptedRevisionId: { not: null } },
          ],
        },
        select: {
          id: true,
          connectionId: true,
          status: true,
          currentPendingRevisionId: true,
          currentAcceptedRevisionId: true,
          updatedAt: true,
        },
        orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
      },
    },
  },
});

type GatedInterestRow = Prisma.ActionInterestGetPayload<{
  select: typeof gatedInterestSelect;
}>;

type StableAssignment = Readonly<{
  key: string;
  eligible: boolean;
  variant: ExperimentVariant;
}>;

type CurrentUser = Readonly<{
  id: string;
  email: string | null;
  username: string;
  school: string | null;
  onboardingComplete: boolean;
  isGuest: boolean;
  verifiedStudent: boolean;
}>;

export type CreatorGatedInterestContextDTO =
  | (ActionCoordinationJsonObject & {
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
    })
  | (ActionCoordinationJsonObject & { kind: "TOMBSTONE" });

export type CreatorGatedPlanDraftDTO =
  | (ActionCoordinationJsonObject & {
      kind: "LIVE";
      title: string;
      startTime: string | null;
      endTime: string | null;
      location: string | null;
      planType: PlanType;
    })
  | (ActionCoordinationJsonObject & { kind: "TOMBSTONE" });

type CreatorGatedInterestFocusDTO =
  | InterestRouteFocus
  | ActionContextRouteFocus
  | PlanRouteFocus;

export type CreatorGatedInterestDTO = ActionCoordinationJsonObject & {
  id: string;
  actionId: string;
  actionState: ClassmatePostStatus;
  actionExpiresAt: string;
  interestState: "ACTIVE" | "WITHDRAWN";
  coordinationState: ActionCoordinationState;
  activationId: string;
  activationStartedAt: string;
  terminalReason: ActionInterestTerminalReason | null;
  terminalAt: string | null;
  context: CreatorGatedInterestContextDTO;
  planDraft: CreatorGatedPlanDraftDTO;
  focus: CreatorGatedInterestFocusDTO & ActionCoordinationJsonObject;
  coordinationPolicy: "CREATOR_GATED_V2";
  policySchemaVersion: 1;
  createdAt: string;
  updatedAt: string;
};

export type CreatorGatedInterestEnvelopeDTO = ActionCoordinationJsonObject & {
  interest: CreatorGatedInterestDTO;
};

export type CreatorGatedMyInterestsDTO = ActionCoordinationJsonObject & {
  interests: CreatorGatedInterestDTO[];
  nextCursor: string | null;
};

export type CreatorGatedInterestMutationResult =
  ActionCoordinationAtomicCommandResult<CreatorGatedInterestEnvelopeDTO>;

export type MyCreatorGatedInterestFilter = "ALL" | "WAITING" | "TERMINAL";

export class CreatorGatedInterestCursorError extends Error {
  readonly code = "INVALID_CURSOR" as const;

  constructor() {
    super("The response cursor is invalid or belongs to another collection.");
    this.name = "CreatorGatedInterestCursorError";
  }
}

type AssignmentResolver = (
  user: Pick<CurrentUser, "id" | "email" | "username">,
  capability: ActionCoordinationCapability,
  tx: Prisma.TransactionClient,
) => Promise<StableAssignment>;

export type CreatorGatedInterestServiceDependencies = Readonly<{
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

type LockedAction = NonNullable<
  Awaited<ReturnType<typeof loadActionForMutation>>
>;

function database(dependencies: CreatorGatedInterestServiceDependencies) {
  return dependencies.db ?? prisma;
}

type MyInterestsCursor = Readonly<{
  version: 1;
  actorHash: string;
  state: MyCreatorGatedInterestFilter;
  activationStartedAt: string;
  interestId: string;
}>;

function cursorActorHash(actorId: string): string {
  return createHash("sha256")
    .update("sideseat:creator-gated-my-interests:v1\0", "utf8")
    .update(actorId, "utf8")
    .digest("base64url");
}

async function consumeInterestActivationRateLimit(
  tx: Prisma.TransactionClient,
  actorId: string,
  actionId: string,
  now: Date,
): Promise<void> {
  const windowStartedAt = new Date(
    Math.floor(now.getTime() / INTEREST_ACTIVATION_RATE_WINDOW_MS) *
      INTEREST_ACTIVATION_RATE_WINDOW_MS,
  );
  const expiresAt = new Date(
    windowStartedAt.getTime() + INTEREST_ACTIVATION_RATE_WINDOW_MS,
  );
  const id = createHash("sha256")
    .update("sideseat:creator-gated-interest-activation-rate:v1\0", "utf8")
    .update(actorId, "utf8")
    .update("\0", "utf8")
    .update(actionId, "utf8")
    .update("\0", "utf8")
    .update(windowStartedAt.toISOString(), "utf8")
    .digest("hex");
  const counters = await tx.$queryRaw<Array<{ count: number }>>(Prisma.sql`
    INSERT INTO "ApiRateLimitCounter"
      ("id", "scope", "count", "windowStartedAt", "expiresAt", "updatedAt")
    VALUES
      (${id}, 'creator-gated-interest-activation', 1,
       ${windowStartedAt}, ${expiresAt}, ${now})
    ON CONFLICT ("id") DO UPDATE SET
      "count" = "ApiRateLimitCounter"."count" + 1,
      "updatedAt" = EXCLUDED."updatedAt"
    RETURNING "count"
  `);
  await tx.apiRateLimitCounter.deleteMany({
    where: { expiresAt: { lt: now }, id: { not: id } },
  });
  if ((counters[0]?.count ?? INTEREST_ACTIVATION_RATE_LIMIT + 1) >
      INTEREST_ACTIVATION_RATE_LIMIT) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((expiresAt.getTime() - now.getTime()) / 1_000),
    );
    throw new ActionCoordinationFailure(
      "INTEREST_RATE_LIMITED",
      "Too many responses were sent for this opportunity. Try again shortly.",
      429,
      true,
      retryAfterSeconds,
    );
  }
}

function encodeMyInterestsCursor(
  actorId: string,
  state: MyCreatorGatedInterestFilter,
  activationStartedAt: Date,
  interestId: string,
): string {
  return Buffer.from(
    JSON.stringify({
      version: 1,
      actorHash: cursorActorHash(actorId),
      state,
      activationStartedAt: activationStartedAt.toISOString(),
      interestId,
    } satisfies MyInterestsCursor),
    "utf8",
  ).toString("base64url");
}

function decodeMyInterestsCursor(
  value: string | null | undefined,
  actorId: string,
  state: MyCreatorGatedInterestFilter,
): { activationStartedAt: Date; interestId: string } | null {
  if (!value) return null;
  if (value.length > 1024 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new CreatorGatedInterestCursorError();
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
  } catch {
    throw new CreatorGatedInterestCursorError();
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    Array.isArray(parsed) ||
    Object.keys(parsed).sort().join(",") !==
      "activationStartedAt,actorHash,interestId,state,version"
  ) {
    throw new CreatorGatedInterestCursorError();
  }
  const cursor = parsed as Partial<MyInterestsCursor>;
  const activationStartedAt = new Date(cursor.activationStartedAt ?? NaN);
  if (
    cursor.version !== 1 ||
    cursor.actorHash !== cursorActorHash(actorId) ||
    cursor.state !== state ||
    typeof cursor.interestId !== "string" ||
    cursor.interestId.length === 0 ||
    !Number.isFinite(activationStartedAt.getTime()) ||
    activationStartedAt.toISOString() !== cursor.activationStartedAt
  ) {
    throw new CreatorGatedInterestCursorError();
  }
  return { activationStartedAt, interestId: cursor.interestId };
}

function actionSourceKind(
  category: ClassmatePostCategory,
): ProductFunnelSourceKind {
  return category === "SHARED_COURSES" ? "COURSE_ACTION" : "BUDDY_POST";
}

function planTypeForCategory(category: ClassmatePostCategory): PlanType {
  switch (category) {
    case "STUDY":
    case "SHARED_COURSES":
      return "STUDY";
    case "MEALS":
      return "MEAL";
    case "SPORTS":
      return "SPORTS";
    case "LANGUAGE":
      return "LANGUAGE";
    default:
      return "CUSTOM";
  }
}

function funnelSurface(surface: ActionInterestSurface) {
  return surface === "FEED_CARD" ? "DISCOVER_EXPLORE" : "ACTION_DETAIL";
}

function actionAttribution(action: LockedAction) {
  return {
    coordinationPolicy: "CREATOR_GATED_V2" as const,
    policySchemaVersion: ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
    experimentKey: action.experimentKeySnapshot!,
    experimentVariant: action.experimentVariantSnapshot!,
  };
}

function assertCreatorGatedPolicy(action: {
  coordinationPolicy: LockedAction["coordinationPolicy"];
  policySchemaVersion: LockedAction["policySchemaVersion"];
  policyParametersSnapshot: LockedAction["policyParametersSnapshot"];
  experimentKeySnapshot: LockedAction["experimentKeySnapshot"];
  experimentVariantSnapshot: LockedAction["experimentVariantSnapshot"];
  clientCapabilitySnapshot: LockedAction["clientCapabilitySnapshot"];
  policySnapshottedAt: LockedAction["policySnapshottedAt"];
}): void {
  if (actionPolicyTupleKind(action) !== "SNAPSHOTTED_CREATOR_GATED") {
    throw new ActionCoordinationFailure(
      "COORDINATION_POLICY_UNSUPPORTED",
      "This opportunity uses another coordination flow.",
      409,
    );
  }
}

function assertCapability(capability: ActionCoordinationCapability): void {
  if (!capability.supported) {
    throw new ActionCoordinationFailure(
      "CLIENT_CAPABILITY_REQUIRED",
      "Update the app before responding to this opportunity.",
      426,
    );
  }
}

async function requireTreatmentAssignment(
  user: CurrentUser,
  capability: ActionCoordinationCapability,
  tx: Prisma.TransactionClient,
  dependencies: CreatorGatedInterestServiceDependencies,
): Promise<StableAssignment> {
  if (!(dependencies.enrollmentAllowed ?? isCreatorGatedExperimentEnrollmentEnabled)()) {
    throw safetyUnavailable(404);
  }
  const assignment = await (
    dependencies.resolveAssignment ??
    ((candidate, candidateCapability, candidateTx) =>
      getCreatorGatedActionToPlanAssignment(
        candidate,
        candidateCapability,
        candidateTx,
      ))
  )(user, capability, tx);
  if (
    assignment.key !== CREATOR_GATED_ACTION_EXPERIMENT_KEY ||
    !assignment.eligible ||
    assignment.variant !== "TREATMENT"
  ) {
    throw safetyUnavailable(404);
  }
  return assignment;
}

async function discoverActionPair(
  actionId: string,
  actorId: string,
  db: PrismaClient,
): Promise<readonly [string, string]> {
  const action = await db.classmatePost.findUnique({
    where: { id: actionId },
    select: { userId: true },
  });
  if (!action) throw safetyUnavailable(404);
  if (action.userId === actorId) throw safetyUnavailable(403);
  return [actorId, action.userId] as const;
}

async function discoverInterestPair(
  interestId: string,
  actorId: string,
  db: PrismaClient,
): Promise<Readonly<{
  actionId: string;
  pair: readonly [string, string];
}>> {
  const interest = await db.actionInterest.findUnique({
    where: { id: interestId },
    select: {
      userId: true,
      classmatePostId: true,
      classmatePost: { select: { userId: true } },
    },
  });
  if (!interest || interest.userId !== actorId) throw safetyUnavailable(404);
  if (interest.classmatePost.userId === actorId) throw safetyUnavailable(404);
  return Object.freeze({
    actionId: interest.classmatePostId,
    pair: [actorId, interest.classmatePost.userId] as const,
  });
}

async function runExpiryPreflight(
  actionId: string,
  dependencies: CreatorGatedInterestServiceDependencies,
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
  expectedCreatorId: string,
): Promise<void> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ClassmatePost"
    WHERE "id" = ${actionId}
      AND "userId" = ${expectedCreatorId}
    FOR UPDATE
  `);
  if (!rows[0]) throw safetyUnavailable(404);
}

async function loadActionForMutation(
  tx: Prisma.TransactionClient,
  actionId: string,
  expectedCreatorId: string,
  actorId: string,
  now: Date,
) {
  await lockAction(tx, actionId, expectedCreatorId);
  const [action, actor, actorCourses, pairBlock, moderationBlock] =
    await Promise.all([
      tx.classmatePost.findUnique({
        where: { id: actionId },
        include: {
          user: {
            select: {
              id: true,
              username: true,
              nickname: true,
              school: true,
              onboardingComplete: true,
              isGuest: true,
            },
          },
          courses: {
            include: {
              course: { select: { id: true, code: true, name: true } },
            },
            orderBy: { courseId: "asc" },
          },
        },
      }),
      tx.user.findUnique({
        where: { id: actorId },
        select: {
          id: true,
          email: true,
          username: true,
          school: true,
          onboardingComplete: true,
          isGuest: true,
          verifiedStudent: true,
        },
      }),
      tx.userCourse.findMany({
        where: { userId: actorId, ...activeCourseMembershipWhere(now) },
        select: { courseId: true },
      }),
      tx.block.findFirst({
        where: {
          OR: [
            { blockerId: actorId, blockedId: expectedCreatorId },
            { blockerId: expectedCreatorId, blockedId: actorId },
          ],
        },
        select: { id: true },
      }),
      tx.moderationBlock.findFirst({
        where: {
          userId: { in: [actorId, expectedCreatorId] },
          isActive: true,
        },
        select: { id: true },
      }),
    ]);
  if (
    !action ||
    action.userId !== expectedCreatorId ||
    !actor ||
    actor.isGuest ||
    !actor.onboardingComplete ||
    action.user.isGuest ||
    !action.user.onboardingComplete ||
    pairBlock ||
    moderationBlock
  ) {
    throw safetyUnavailable(404);
  }
  assertCreatorGatedPolicy(action);

  const actorCourseIds = new Set(actorCourses.map((row) => row.courseId));
  const sharedCourse = action.courses.find((row) =>
    actorCourseIds.has(row.courseId),
  );
  const actorSchool = normalizeSchoolCode(actor.school);
  const creatorSchool = normalizeSchoolCode(action.user.school);
  const sameSchool = actorSchool !== null && actorSchool === creatorSchool;
  const visible =
    action.visibility === "CITY_INTERNATIONALS" ||
    (action.visibility === "VERIFIED_ONLY" && actor.verifiedStudent) ||
    (action.visibility === "SCHOOL_ONLY" && sameSchool) ||
    (action.visibility === "COURSEMATES_ONLY" && Boolean(sharedCourse));
  const validCourseAction =
    action.category !== "SHARED_COURSES" ||
    (action.courses.length === 1 && Boolean(sharedCourse));
  if (!visible || !validCourseAction) throw safetyUnavailable(404);

  return Object.assign(action, { actor, sharedCourse });
}

function requireActionAcceptingNewInterest(
  action: LockedAction,
  now: Date,
): void {
  if (action.status === "REMOVED") throw safetyUnavailable(404);
  if (action.status === "CLOSED") {
    throw new ActionCoordinationFailure(
      "ACTION_CLOSED",
      "This opportunity is no longer accepting responses.",
      409,
    );
  }
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
  if (action.status === "FULFILLED") {
    throw new ActionCoordinationFailure(
      "ACTION_FULFILLED",
      "This opportunity has already formed a plan.",
      409,
    );
  }
  if (action.status !== "ACTIVE") throw safetyUnavailable(404);
}

async function lockInterestGraph(
  tx: Prisma.TransactionClient,
  interestId: string,
): Promise<GatedInterestRow> {
  const interests = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ActionInterest"
    WHERE "id" = ${interestId}
    FOR UPDATE
  `);
  if (!interests[0]) throw safetyUnavailable(404);
  await tx.$queryRaw<Array<{ contextId: string; activationId: string }>>(
    Prisma.sql`
      SELECT
        context."id" AS "contextId",
        activation."id" AS "activationId"
      FROM "ActionCoordinationContext" context
      INNER JOIN "ActionInterestActivation" activation
        ON activation."id" = context."currentActivationId"
      WHERE context."interestId" = ${interestId}
      FOR UPDATE OF context, activation
    `,
  );
  const row = await tx.actionInterest.findUnique({
    where: { id: interestId },
    select: gatedInterestSelect,
  });
  if (!row) throw safetyUnavailable(404);
  return row;
}

async function findAndLockInterestForAction(
  tx: Prisma.TransactionClient,
  actorId: string,
  actionId: string,
): Promise<GatedInterestRow | null> {
  const rows = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id"
    FROM "ActionInterest"
    WHERE "userId" = ${actorId}
      AND "classmatePostId" = ${actionId}
    FOR UPDATE
  `);
  return rows[0] ? lockInterestGraph(tx, rows[0].id) : null;
}

function trustedSnapshot(
  action: LockedAction,
  actorId: string,
): ActionContextSnapshot {
  const course = action.sharedCourse?.course ?? action.courses[0]?.course ?? null;
  const candidate: ActionContextSnapshot = {
    version: 1,
    sourceKind:
      action.category === "SHARED_COURSES" ? "COURSE_ACTION" : "BUDDY_POST",
    sourceId: action.id,
    title: action.title,
    startsAt: action.startsAt?.toISOString() ?? null,
    endsAt: action.endsAt?.toISOString() ?? null,
    location: action.location,
    planType: planTypeForCategory(action.category),
    participantIds: [actorId, action.userId],
    author: {
      id: action.userId,
      displayName: action.user.nickname?.trim() || action.user.username,
    },
    course: course
      ? { id: course.id, code: course.code, name: course.name }
      : null,
  };
  const parsed = parseActionContextSnapshot(candidate);
  if (!parsed) {
    throw new Error("A trusted Action could not produce a valid context snapshot.");
  }
  return parsed;
}

function safePlanDraft(
  snapshot: ActionContextSnapshot,
  now: Date,
): CreatorGatedPlanDraftDTO {
  const inheritedStart = snapshot.startsAt
    ? new Date(snapshot.startsAt)
    : null;
  const startsInFuture =
    inheritedStart !== null && inheritedStart.getTime() > now.getTime();
  return {
    kind: "LIVE",
    title: snapshot.title,
    startTime: startsInFuture ? snapshot.startsAt : null,
    endTime: startsInFuture ? snapshot.endsAt : null,
    location: snapshot.location,
    planType: snapshot.planType,
  };
}

function recoveryFocus(
  row: GatedInterestRow,
): CreatorGatedInterestFocusDTO {
  const context = row.coordinationContext;
  if (!context) return { type: "INTEREST", interestId: row.id };
  const commitments = [...context.originPlanCommitments].sort((left, right) => {
    const leftPriority = left.currentPendingRevisionId ? 0 : 1;
    const rightPriority = right.currentPendingRevisionId ? 0 : 1;
    if (leftPriority !== rightPriority) return leftPriority - rightPriority;
    return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
  });
  const commitment = commitments[0];
  if (commitment) {
    const revisionId =
      commitment.currentPendingRevisionId ??
      commitment.currentAcceptedRevisionId ??
      undefined;
    return revisionId
      ? {
          type: "PLAN",
          connectionId: commitment.connectionId,
          commitmentId: commitment.id,
          revisionId,
        }
      : {
          type: "PLAN",
          connectionId: commitment.connectionId,
          commitmentId: commitment.id,
        };
  }
  if (context.connectionId) {
    return {
      type: "ACTION_CONTEXT",
      connectionId: context.connectionId,
      contextId: context.id,
    };
  }
  return { type: "INTEREST", interestId: row.id };
}

function serializeInterest(
  row: GatedInterestRow,
  now: Date,
): CreatorGatedInterestDTO {
  assertCreatorGatedPolicy(row.classmatePost as LockedAction);
  const contextState = row.coordinationContext;
  const activation = contextState?.currentActivation;
  if (
    row.connectionId !== null && contextState?.state !== "OPEN" &&
    contextState?.state !== "ENDED"
  ) {
    throw new Error("A pre-Connect creator-gated Interest owns a Connection.");
  }
  if (
    !contextState ||
    !activation ||
    contextState.currentActivationId !== activation.id ||
    activation.interestId !== row.id
  ) {
    throw new Error("A creator-gated Interest has no authoritative activation context.");
  }
  const origin = parseActionOriginSnapshot(row.originSnapshot);
  if (!origin || origin.snapshot.sourceId !== row.classmatePostId) {
    throw new Error("A creator-gated Interest has an invalid immutable Action snapshot.");
  }
  if (
    origin.kind === "LIVE" &&
    (!origin.snapshot.participantIds.includes(row.userId) ||
      !origin.snapshot.participantIds.includes(row.classmatePost.userId))
  ) {
    throw new Error("A creator-gated Interest has an invalid participant snapshot.");
  }
  const contextDTO: CreatorGatedInterestContextDTO =
    origin.kind === "TOMBSTONE"
      ? { kind: "TOMBSTONE" }
      : {
          kind: "LIVE",
          title: origin.snapshot.title,
          startsAt: origin.snapshot.startsAt,
          endsAt: origin.snapshot.endsAt,
          location: origin.snapshot.location,
          course: origin.snapshot.course,
        };
  const planDraft: CreatorGatedPlanDraftDTO =
    origin.kind === "TOMBSTONE"
      ? { kind: "TOMBSTONE" }
      : safePlanDraft(origin.snapshot, now);
  return {
    id: row.id,
    actionId: row.classmatePostId,
    actionState: row.classmatePost.status,
    actionExpiresAt: row.classmatePost.expiresAt.toISOString(),
    interestState: row.status,
    coordinationState: contextState.state,
    activationId: activation.id,
    activationStartedAt: activation.startedAt.toISOString(),
    terminalReason:
      activation.terminalReason === "SAFETY_UNAVAILABLE_BEFORE_CONNECT"
        ? null
        : activation.terminalReason,
    terminalAt: activation.terminalAt?.toISOString() ?? null,
    context: contextDTO,
    planDraft,
    focus: recoveryFocus(row),
    coordinationPolicy: "CREATOR_GATED_V2",
    policySchemaVersion: ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function tombstonedInterestIdFromReplay(
  replay: ActionCoordinationReplayResponse<CreatorGatedInterestEnvelopeDTO>,
): string | null {
  if (replay.status < 200 || replay.status > 299) return null;
  const body = replay.body as Record<string, unknown>;
  const interest = body.interest;
  if (!interest || typeof interest !== "object" || Array.isArray(interest)) {
    return null;
  }
  const candidate = interest as Record<string, unknown>;
  const context = candidate.context;
  const planDraft = candidate.planDraft;
  if (
    typeof candidate.id !== "string" ||
    candidate.id.length === 0 ||
    !context ||
    typeof context !== "object" ||
    Array.isArray(context) ||
    (context as Record<string, unknown>).kind !== "TOMBSTONE" ||
    !planDraft ||
    typeof planDraft !== "object" ||
    Array.isArray(planDraft) ||
    (planDraft as Record<string, unknown>).kind !== "TOMBSTONE"
  ) {
    return null;
  }
  return candidate.id;
}

/**
 * Normal replays retain the original wire result. A safety terminalizer first
 * replaces only the private LIVE fields with TOMBSTONE, which is the marker
 * that permits this hook to refresh the remaining public state. This keeps
 * ordinary idempotency stable while returning the authoritative unavailable /
 * ended state after Block or moderation.
 */
async function refreshSafetyTombstonedInterestReplay(
  context: ActionCoordinationTransactionContext,
  replay: ActionCoordinationReplayResponse<CreatorGatedInterestEnvelopeDTO>,
  actorId: string,
): Promise<ActionCoordinationReplayResponse<CreatorGatedInterestEnvelopeDTO>> {
  const interestId = tombstonedInterestIdFromReplay(replay);
  if (!interestId) return replay;
  const row = await context.tx.actionInterest.findUnique({
    where: { id: interestId },
    select: gatedInterestSelect,
  });
  if (
    !row ||
    row.userId !== actorId ||
    actionPolicyTupleKind(row.classmatePost) !== "SNAPSHOTTED_CREATOR_GATED"
  ) {
    return {
      status: 404,
      body: {
        error: {
          code: "SAFETY_UNAVAILABLE",
          message: "The requested coordination is unavailable.",
          retryable: false,
        },
      },
    };
  }
  return {
    status: replay.status,
    body: { interest: serializeInterest(row, context.now) },
  };
}

async function reloadInterest(
  tx: Prisma.TransactionClient,
  interestId: string,
): Promise<GatedInterestRow> {
  const row = await tx.actionInterest.findUnique({
    where: { id: interestId },
    select: gatedInterestSelect,
  });
  if (!row) throw new Error("Interest disappeared before response serialization.");
  return row;
}

async function recordInterestedEffects(
  tx: Prisma.TransactionClient,
  action: LockedAction,
  interestId: string,
  activationId: string,
  contextId: string,
  interestSurface: ActionInterestSurface,
  actorId: string,
  now: Date,
): Promise<void> {
  const eventKey = businessFunnelEventKeys.actionInterested(activationId);
  await recordServerFunnelEvent(tx, {
    businessEventKey: eventKey,
    actorId,
    name: "ACTION_INTERESTED",
    surface: funnelSurface(interestSurface),
    sourceKind: actionSourceKind(action.category),
    sourceId: action.id,
    actionInterestId: interestId,
    interestActivationId: activationId,
    actionContextId: contextId,
    interestSurface,
    ...actionAttribution(action),
    occurredAt: now,
  });
  await enqueueNotificationOutboxItem(tx, {
    kind: "ACTION_INTERESTED",
    recipientId: action.userId,
    sourceKey: notificationOutboxSourceKeys.forBusinessEvent(eventKey),
    destination: {
      type: "ACTION_RESPONSES",
      actionId: action.id,
      interestId,
    },
    availableAt: now,
  });
}

async function createInitialInterest(
  tx: Prisma.TransactionClient,
  action: LockedAction,
  actorId: string,
  surface: ActionInterestSurface,
  now: Date,
): Promise<GatedInterestRow> {
  const snapshot = trustedSnapshot(action, actorId);
  const interest = await tx.actionInterest.create({
    data: {
      userId: actorId,
      classmatePostId: action.id,
      connectionId: null,
      status: "ACTIVE",
      originSnapshot: snapshot as Prisma.InputJsonObject,
      withdrawnAt: null,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
  const activation = await tx.actionInterestActivation.create({
    data: {
      interestId: interest.id,
      ordinal: 1,
      interestSurface: surface,
      startedAt: now,
    },
    select: { id: true },
  });
  const context = await tx.actionCoordinationContext.create({
    data: {
      interestId: interest.id,
      currentActivationId: activation.id,
      state: "WAITING",
      reservationGeneration: 0,
      createdAt: now,
      updatedAt: now,
    },
    select: { id: true },
  });
  await tx.actionInterestPresentation.create({
    data: {
      interestId: interest.id,
      creatorId: action.userId,
      version: 0,
      updatedAt: now,
    },
  });
  await recordInterestedEffects(
    tx,
    action,
    interest.id,
    activation.id,
    context.id,
    surface,
    actorId,
    now,
  );
  return reloadInterest(tx, interest.id);
}

async function reactivateWithdrawnInterest(
  tx: Prisma.TransactionClient,
  action: LockedAction,
  row: GatedInterestRow,
  surface: ActionInterestSurface,
  now: Date,
): Promise<GatedInterestRow> {
  const context = row.coordinationContext;
  const previousActivation = context?.currentActivation;
  if (
    row.status !== "WITHDRAWN" ||
    row.connectionId !== null ||
    !context ||
    context.state !== "UNAVAILABLE" ||
    !previousActivation ||
    previousActivation.connectedAt !== null ||
    previousActivation.terminalReason !==
      "INTEREST_WITHDRAWN_BEFORE_CONNECT"
  ) {
    throw new ActionCoordinationFailure(
      "INTEREST_WITHDRAWAL_LOCKED",
      "This response cannot be reactivated.",
      409,
    );
  }
  const connectedHistory = await tx.actionInterestActivation.count({
    where: { interestId: row.id, connectedAt: { not: null } },
  });
  if (connectedHistory > 0) {
    throw new ActionCoordinationFailure(
      "INTEREST_WITHDRAWAL_LOCKED",
      "A completed coordination cannot be reopened from this response.",
      409,
    );
  }
  const last = await tx.actionInterestActivation.aggregate({
    where: { interestId: row.id },
    _max: { ordinal: true },
  });
  const activation = await tx.actionInterestActivation.create({
    data: {
      interestId: row.id,
      ordinal: (last._max.ordinal ?? 0) + 1,
      interestSurface: surface,
      startedAt: now,
    },
    select: { id: true },
  });
  await tx.actionInterest.update({
    where: { id: row.id },
    data: { status: "ACTIVE", withdrawnAt: null, updatedAt: now },
  });
  await tx.actionCoordinationContext.update({
    where: { id: context.id },
    data: {
      currentActivationId: activation.id,
      state: "WAITING",
      reservationId: null,
      leaseExpiresAt: null,
      connectionId: null,
      activatedAt: null,
      firstCounterpartResponseAt: null,
      endedAt: null,
      endedById: null,
      endReason: null,
      updatedAt: now,
    },
  });
  await recordInterestedEffects(
    tx,
    action,
    row.id,
    activation.id,
    context.id,
    surface,
    row.userId,
    now,
  );
  return reloadInterest(tx, row.id);
}

function mutationRequest(options: {
  actorId: string;
  idempotencyKey: string;
  method: "POST" | "DELETE";
  operationId: string;
  resourceKind: "ACTION" | "ACTION_INTEREST";
  resourceId: string;
  body?: ActionCoordinationJsonValue;
}) {
  const pathParameters: ActionCoordinationJsonObject =
    options.resourceKind === "ACTION"
      ? { actionId: options.resourceId }
      : { interestId: options.resourceId };
  return {
    actorId: options.actorId,
    idempotencyKey: options.idempotencyKey,
    operation: {
      method: options.method,
      operationId: options.operationId,
    },
    canonicalResource: {
      kind: options.resourceKind,
      id: options.resourceId,
    },
    pathParameters,
    body: options.body ?? null,
  } as const;
}

export async function createCreatorGatedInterest(options: {
  actorId: string;
  actionId: string;
  interestSurface: ActionInterestSurface;
  idempotencyKey: string;
  capability: ActionCoordinationCapability;
  dependencies?: CreatorGatedInterestServiceDependencies;
}): Promise<CreatorGatedInterestMutationResult> {
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  await runExpiryPreflight(options.actionId, dependencies);
  const pair = await discoverActionPair(options.actionId, options.actorId, db);
  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: "POST",
        operationId: "createCreatorGatedActionInterest",
        resourceKind: "ACTION",
        resourceId: options.actionId,
        body: { interestSurface: options.interestSurface },
      }),
      pairs: [pair],
      execute: async ({ tx, now }) => {
        assertCapability(options.capability);
        const action = await loadActionForMutation(
          tx,
          options.actionId,
          pair[1],
          options.actorId,
          now,
        );
        await requireTreatmentAssignment(
          action.actor,
          options.capability,
          tx,
          dependencies,
        );
        if (action.status === "REMOVED") throw safetyUnavailable(404);
        const existing = await findAndLockInterestForAction(
          tx,
          options.actorId,
          options.actionId,
        );
        if (existing) {
          if (existing.connectionId !== null) {
            throw new ActionCoordinationFailure(
              "COORDINATION_POLICY_UNSUPPORTED",
              "This response belongs to another coordination flow.",
              409,
            );
          }
          if (existing.status === "WITHDRAWN") {
            const current = serializeInterest(existing, now);
            throw new ActionCoordinationConflict(
              "INTEREST_NOT_ACTIVE",
              "Reactivate this response before continuing.",
              current,
              {
                action: "REACTIVATE_INTEREST",
                focus: { type: "INTEREST", interestId: existing.id },
              },
            );
          }
          return {
            status: 200,
            body: { interest: serializeInterest(existing, now) },
          };
        }
        requireActionAcceptingNewInterest(action, now);
        await consumeInterestActivationRateLimit(
          tx,
          options.actorId,
          options.actionId,
          now,
        );
        const created = await createInitialInterest(
          tx,
          action,
          options.actorId,
          options.interestSurface,
          now,
        );
        return {
          status: 201,
          body: { interest: serializeInterest(created, now) },
        };
      },
      refreshReplay: (context, replay) =>
        refreshSafetyTombstonedInterestReplay(
          context,
          replay,
          options.actorId,
        ),
    },
    {
      db,
      clock: dependencies.clock,
      transactionOptions: dependencies.transactionOptions,
    },
  );
}

export async function reactivateCreatorGatedInterest(options: {
  actorId: string;
  interestId: string;
  interestSurface: ActionInterestSurface;
  idempotencyKey: string;
  capability: ActionCoordinationCapability;
  dependencies?: CreatorGatedInterestServiceDependencies;
}): Promise<CreatorGatedInterestMutationResult> {
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  const discovered = await discoverInterestPair(
    options.interestId,
    options.actorId,
    db,
  );
  await runExpiryPreflight(discovered.actionId, dependencies);
  const pair = discovered.pair;
  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: "POST",
        operationId: "reactivateCreatorGatedActionInterest",
        resourceKind: "ACTION_INTEREST",
        resourceId: options.interestId,
        body: { interestSurface: options.interestSurface },
      }),
      pairs: [pair],
      execute: async ({ tx, now }) => {
        assertCapability(options.capability);
        // The non-locking snapshot resolves the pair and Action identity only.
        // Authoritative mutation order remains pair -> Action -> Interest graph.
        const action = await loadActionForMutation(
          tx,
          discovered.actionId,
          pair[1],
          options.actorId,
          now,
        );
        const row = await lockInterestGraph(tx, options.interestId);
        if (
          row.userId !== options.actorId ||
          row.classmatePost.userId !== pair[1] ||
          row.classmatePostId !== action.id ||
          row.classmatePostId !== discovered.actionId
        ) {
          throw safetyUnavailable(404);
        }
        await requireTreatmentAssignment(
          action.actor,
          options.capability,
          tx,
          dependencies,
        );
        if (row.status === "ACTIVE") {
          return {
            status: 200,
            body: { interest: serializeInterest(row, now) },
          };
        }
        requireActionAcceptingNewInterest(action, now);
        await consumeInterestActivationRateLimit(
          tx,
          options.actorId,
          action.id,
          now,
        );
        const reactivated = await reactivateWithdrawnInterest(
          tx,
          action,
          row,
          options.interestSurface,
          now,
        );
        return {
          status: 201,
          body: { interest: serializeInterest(reactivated, now) },
        };
      },
      refreshReplay: (context, replay) =>
        refreshSafetyTombstonedInterestReplay(
          context,
          replay,
          options.actorId,
        ),
    },
    {
      db,
      clock: dependencies.clock,
      transactionOptions: dependencies.transactionOptions,
    },
  );
}

export async function withdrawCreatorGatedInterest(options: {
  actorId: string;
  interestId: string;
  idempotencyKey: string;
  dependencies?: CreatorGatedInterestServiceDependencies;
}): Promise<CreatorGatedInterestMutationResult> {
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  const discovered = await discoverInterestPair(
    options.interestId,
    options.actorId,
    db,
  );
  const pair = discovered.pair;
  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: "DELETE",
        operationId: "withdrawCreatorGatedActionInterest",
        resourceKind: "ACTION_INTEREST",
        resourceId: options.interestId,
      }),
      pairs: [pair],
      execute: async ({ tx, now }) => {
        // Safe drain deliberately does not consult feature, allowlist,
        // capability, or current experiment eligibility gates.
        // The unlocked resource snapshot resolved the immutable Action ID.
        // The authoritative order inside the pair transaction is Action first,
        // then the Interest/Activation/Context graph.
        await lockAction(tx, discovered.actionId, pair[1]);
        const row = await lockInterestGraph(tx, options.interestId);
        if (
          row.userId !== options.actorId ||
          row.classmatePost.userId !== pair[1] ||
          row.classmatePostId !== discovered.actionId
        ) {
          throw safetyUnavailable(404);
        }
        assertCreatorGatedPolicy(row.classmatePost as LockedAction);
        const context = row.coordinationContext;
        const activation = context?.currentActivation;
        if (!context || !activation) {
          throw new ActionCoordinationFailure(
            "COORDINATION_POLICY_UNSUPPORTED",
            "This response has no creator-gated coordination state.",
            409,
          );
        }
        if (row.status === "WITHDRAWN") {
          return {
            status: 200,
            body: { interest: serializeInterest(row, now) },
          };
        }
        if (context.state === "OPEN") {
          throw new ActionCoordinationFailure(
            "INTEREST_ALREADY_COORDINATING",
            "End the existing coordination instead of withdrawing this response.",
            409,
          );
        }
        if (context.state === "ENDED" || context.state === "UNAVAILABLE") {
          return {
            status: 200,
            body: { interest: serializeInterest(row, now) },
          };
        }
        if (
          activation.connectedAt !== null ||
          activation.terminalReason !== null ||
          (context.state !== "WAITING" && context.state !== "INITIATING")
        ) {
          throw new ActionCoordinationFailure(
            "INTEREST_WITHDRAWAL_LOCKED",
            "This response can no longer be withdrawn here.",
            409,
          );
        }

        const terminalized = await tx.$queryRaw<Array<{ id: string }>>(
          Prisma.sql`
            UPDATE "ActionInterestActivation"
            SET
              "terminalReason" = CAST(
                'INTEREST_WITHDRAWN_BEFORE_CONNECT'
                AS "ActionInterestTerminalReason"
              ),
              "terminalAt" = ${now}
            WHERE "id" = ${activation.id}
              AND "connectedAt" IS NULL
              AND "terminalReason" IS NULL
            RETURNING "id"
          `,
        );
        if (!terminalized[0]) {
          throw new ActionCoordinationFailure(
            "INTEREST_WITHDRAWAL_LOCKED",
            "This response changed while it was being withdrawn.",
            409,
          );
        }
        await tx.actionCoordinationContext.update({
          where: { id: context.id },
          data: {
            state: "UNAVAILABLE",
            reservationId: null,
            leaseExpiresAt: null,
            updatedAt: now,
          },
        });
        await tx.actionInterest.update({
          where: { id: row.id },
          data: { status: "WITHDRAWN", withdrawnAt: now, updatedAt: now },
        });

        const sourceKind = actionSourceKindFromSnapshot(row.originSnapshot);
        const attribution = {
          coordinationPolicy: "CREATOR_GATED_V2" as const,
          policySchemaVersion: ACTION_COORDINATION_POLICY_SCHEMA_VERSION,
          experimentKey: row.classmatePost.experimentKeySnapshot!,
          experimentVariant: row.classmatePost.experimentVariantSnapshot!,
        };
        if (context.state === "INITIATING") {
          await recordServerFunnelEvent(tx, {
            businessEventKey: businessFunnelEventKeys.coordinationReleased(
              context.id,
              context.reservationGeneration,
            ),
            actorId: options.actorId,
            name: "COORDINATION_RELEASED",
            surface: funnelSurface(activation.interestSurface),
            sourceKind,
            sourceId: row.classmatePostId,
            actionInterestId: row.id,
            interestActivationId: activation.id,
            actionContextId: context.id,
            ...attribution,
            occurredAt: now,
          });
        }
        await recordServerFunnelEvent(tx, {
          businessEventKey:
            businessFunnelEventKeys.actionInterestWithdrawn(activation.id),
          actorId: options.actorId,
          name: "ACTION_INTEREST_WITHDRAWN",
          surface: funnelSurface(activation.interestSurface),
          sourceKind,
          sourceId: row.classmatePostId,
          actionInterestId: row.id,
          interestActivationId: activation.id,
          actionContextId: context.id,
          interestSurface: activation.interestSurface,
          ...attribution,
          occurredAt: now,
        });
        await recordServerFunnelEvent(tx, {
          businessEventKey:
            businessFunnelEventKeys.actionInterestTerminated(activation.id),
          actorId: options.actorId,
          name: "ACTION_INTEREST_TERMINATED",
          surface: funnelSurface(activation.interestSurface),
          sourceKind,
          sourceId: row.classmatePostId,
          actionInterestId: row.id,
          interestActivationId: activation.id,
          actionContextId: context.id,
          interestSurface: activation.interestSurface,
          terminalReason: "INTEREST_WITHDRAWN_BEFORE_CONNECT",
          ...attribution,
          occurredAt: now,
        });
        const withdrawn = await reloadInterest(tx, row.id);
        return {
          status: 200,
          body: { interest: serializeInterest(withdrawn, now) },
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

function actionSourceKindFromSnapshot(
  originSnapshot: Prisma.JsonValue,
): ProductFunnelSourceKind {
  const origin = parseActionOriginSnapshot(originSnapshot);
  if (!origin) {
    throw new Error("A creator-gated Interest has an invalid immutable snapshot.");
  }
  return origin.snapshot.sourceKind;
}

export async function getCreatorGatedInterest(options: {
  actorId: string;
  interestId: string;
  dependencies?: Pick<CreatorGatedInterestServiceDependencies, "db" | "clock">;
}): Promise<CreatorGatedInterestDTO | null> {
  const db = database(options.dependencies ?? {});
  const row = await db.actionInterest.findUnique({
    where: { id: options.interestId },
    select: gatedInterestSelect,
  });
  if (
    !row ||
    row.userId !== options.actorId ||
    actionPolicyTupleKind(row.classmatePost) !== "SNAPSHOTTED_CREATOR_GATED"
  ) {
    return null;
  }
  const now = options.dependencies?.clock
    ? await db.$transaction((tx) => options.dependencies!.clock!.now(tx))
    : new Date();
  return serializeInterest(row, now);
}

export async function listMyCreatorGatedInterests(options: {
  actorId: string;
  state?: MyCreatorGatedInterestFilter;
  limit?: number;
  cursor?: string | null;
  dependencies?: Pick<CreatorGatedInterestServiceDependencies, "db" | "clock">;
}): Promise<CreatorGatedMyInterestsDTO> {
  const db = database(options.dependencies ?? {});
  const limit = Math.min(
    Math.max(Math.trunc(options.limit ?? DEFAULT_MY_INTERESTS_LIMIT), 1),
    DEFAULT_MY_INTERESTS_LIMIT,
  );
  const state = options.state ?? "ALL";
  const cursor = decodeMyInterestsCursor(
    options.cursor,
    options.actorId,
    state,
  );
  const stateFilter =
    state === "WAITING"
      ? Prisma.sql`
          AND interest."status" = CAST('ACTIVE' AS "ActionInterestStatus")
          AND context."state" IN (
            CAST('WAITING' AS "ActionCoordinationState"),
            CAST('INITIATING' AS "ActionCoordinationState")
          )
        `
      : state === "TERMINAL"
        ? Prisma.sql`
            AND (
              interest."status" = CAST('WITHDRAWN' AS "ActionInterestStatus")
              OR context."state" IN (
                CAST('ENDED' AS "ActionCoordinationState"),
                CAST('UNAVAILABLE' AS "ActionCoordinationState")
              )
            )
          `
        : Prisma.empty;
  // Prisma maps PostgreSQL TIMESTAMP(3) values to UTC Date objects. Passing a
  // Date back through a raw query binds it as TIMESTAMPTZ, which makes the
  // comparison depend on the database session time zone. Re-bind the exact
  // UTC wall timestamp as TIMESTAMP(3) so a cursor cannot repeat/skip a row in
  // non-UTC deployments.
  const cursorWallTimestamp = cursor
    ? cursor.activationStartedAt
        .toISOString()
        .replace("T", " ")
        .replace("Z", "")
    : null;
  const cursorFilter = cursor
    ? Prisma.sql`
        AND (
          activation."startedAt" < CAST(${cursorWallTimestamp} AS TIMESTAMP(3))
          OR (
            activation."startedAt" = CAST(${cursorWallTimestamp} AS TIMESTAMP(3))
            AND interest."id" > ${cursor.interestId}
          )
        )
      `
    : Prisma.empty;
  const keys = await db.$queryRaw<
    Array<{ interestId: string; activationStartedAt: Date }>
  >(Prisma.sql`
    SELECT
      interest."id" AS "interestId",
      activation."startedAt" AS "activationStartedAt"
    FROM "ActionInterest" interest
    INNER JOIN "ClassmatePost" action
      ON action."id" = interest."classmatePostId"
    INNER JOIN "ActionCoordinationContext" context
      ON context."interestId" = interest."id"
    INNER JOIN "ActionInterestActivation" activation
      ON activation."id" = context."currentActivationId"
    WHERE interest."userId" = ${options.actorId}
      AND action."coordinationPolicy" = CAST(
        'CREATOR_GATED_V2' AS "ActionCoordinationPolicy"
      )
      ${stateFilter}
      ${cursorFilter}
    ORDER BY activation."startedAt" DESC, interest."id" ASC
    LIMIT ${limit + 1}
  `);
  const pageKeys = keys.slice(0, limit);
  const unorderedRows = await db.actionInterest.findMany({
    where: { id: { in: pageKeys.map((key) => key.interestId) } },
    select: gatedInterestSelect,
  });
  const byId = new Map(unorderedRows.map((row) => [row.id, row]));
  const rows = pageKeys.map((key) => {
    const row = byId.get(key.interestId);
    if (!row) {
      throw new Error("A response disappeared while its recovery page was loading.");
    }
    return row;
  });
  const now = options.dependencies?.clock
    ? await db.$transaction((tx) => options.dependencies!.clock!.now(tx))
    : new Date();
  const lastKey = pageKeys.at(-1) ?? null;
  return {
    interests: rows.map((row) => serializeInterest(row, now)),
    nextCursor:
      keys.length > limit && lastKey
        ? encodeMyInterestsCursor(
            options.actorId,
            state,
            lastKey.activationStartedAt,
            lastKey.interestId,
          )
        : null,
  };
}
