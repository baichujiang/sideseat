import "server-only";

import { createHash } from "node:crypto";

import {
  Prisma,
  type ActionCoordinationState,
  type ClassmatePostStatus,
  type PrismaClient,
  type ProductFunnelSourceKind,
} from "@prisma/client";

import { findSharedActiveCourse } from "@/lib/courses/shared-active-courses";
import { normalizeSchoolCode } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { parseActionOriginSnapshot } from "@/lib/v2/action-context-snapshot";
import {
  type ActionCoordinationAtomicCommandResult,
  type ActionCoordinationClock,
  type ActionCoordinationTransactionOptions,
  databaseActionCoordinationClock,
  runAtomicActionCoordinationCommand,
} from "@/lib/v2/action-coordination/command";
import type {
  ActionCoordinationJsonObject,
  ActionCoordinationJsonValue,
  ActionResponsesRouteFocus,
} from "@/lib/v2/action-coordination/dto";
import { safetyUnavailable } from "@/lib/v2/action-coordination/errors";
import {
  actionPolicyTupleKind,
  CREATOR_GATED_ACTION_EXPERIMENT_KEY,
} from "@/lib/v2/action-coordination/policy-snapshot";
import {
  isCreatorGatedExperimentEnrollmentEnabled,
  isV2PilotUser,
} from "@/lib/v2/feature-flags";
import {
  businessFunnelEventKeys,
  recordServerFunnelEvent,
} from "@/lib/v2/funnel-event-producer";

export const ACTION_RESPONSE_SNAPSHOT_TTL_MS = 15 * 60_000;
const DEFAULT_RESPONSE_PAGE_LIMIT = 30;
const MAX_RESPONSE_PAGE_LIMIT = 50;

export type ActionResponsePresentationFilter = "VISIBLE" | "HIDDEN";
export type ActionResponsePresentationState = "VISIBLE" | "HIDDEN";
export type ActionResponseCoordinationUnavailableReason =
  | "COORDINATION_START_UNAVAILABLE"
  | "INTEREST_NOT_ACTIVE"
  | "INTEREST_ALREADY_COORDINATING"
  | "ACTION_EXPIRED"
  | "ACTION_FULFILLED"
  | "COORDINATION_LIMIT_REACHED"
  | "ACTION_PLAN_PENDING"
  | "COORDINATION_POLICY_UNSUPPORTED";

export type ActionResponseCountsDTO = ActionCoordinationJsonObject & {
  totalActiveInterestCount: number;
  visibleInterestCount: number;
  unseenVisibleInterestCount: number;
};

export type ActionResponseCourseDTO = ActionCoordinationJsonObject & {
  id: string;
  code: string | null;
  name: string;
};

export type ActionResponseItemDTO = ActionCoordinationJsonObject & {
  interestId: string;
  activationId: string;
  contextId: string;
  responder: ActionCoordinationJsonObject & {
    userId: string;
    displayName: string;
    avatarUrl: string | null;
    verifiedStudent: boolean;
  };
  signals: ActionCoordinationJsonObject & {
    sharedCourse: ActionResponseCourseDTO | null;
    sharedLanguages: ActionCoordinationJsonValue[];
  };
  receivedAt: string;
  viewedAt: string | null;
  hiddenAt: string | null;
  interestState: "ACTIVE" | "WITHDRAWN";
  coordinationState: ActionCoordinationState;
  presentationState: ActionResponsePresentationState;
  canStartCoordination: boolean;
  startCoordinationUnavailableReason:
    | ActionResponseCoordinationUnavailableReason
    | null;
};

export type ActionResponseGroupDTO = ActionCoordinationJsonObject & {
  action: ActionCoordinationJsonObject & {
    id: string;
    title: string;
    actionState: ClassmatePostStatus;
    startsAt: string | null;
    endsAt: string | null;
    location: string | null;
    course: ActionResponseCourseDTO | null;
  };
  counts: ActionResponseCountsDTO;
  responses: ActionResponseItemDTO[];
  focus: ActionResponsesRouteFocus & ActionCoordinationJsonObject;
};

export type ActionResponsesEnvelopeDTO = ActionCoordinationJsonObject & {
  snapshot: ActionCoordinationJsonObject & {
    token: string;
    createdAt: string;
    expiresAt: string;
  };
  groups: ActionResponseGroupDTO[];
  nextCursor: string | null;
};

export type CreatorResponseEntryDTO = ActionCoordinationJsonObject & {
  counts: ActionResponseCountsDTO;
  focus: ActionResponsesRouteFocus & ActionCoordinationJsonObject;
};

export type ActionResponseSummaryDTO = ActionCoordinationJsonObject & {
  actionCountWithUnseenResponses: number;
  unseenVisibleInterestCount: number;
  focus: ActionResponsesRouteFocus & ActionCoordinationJsonObject;
};

export type ActionResponsePresentationDTO = ActionCoordinationJsonObject & {
  interestId: string;
  presentationState: ActionResponsePresentationState;
  hiddenAt: string | null;
  version: number;
  updatedAt: string;
};

export type ActionResponsePresentationEnvelopeDTO =
  ActionCoordinationJsonObject & {
    presentation: ActionResponsePresentationDTO;
    actionId: string;
    counts: ActionResponseCountsDTO;
  };

export type ActionResponsesSeenEnvelopeDTO = ActionCoordinationJsonObject & {
  actionId: string;
  viewed: Array<
    ActionCoordinationJsonObject & {
      interestId: string;
      activationId: string;
      viewedAt: string;
    }
  >;
  counts: ActionResponseCountsDTO;
};

export type ActionResponsePresentationMutationResult =
  ActionCoordinationAtomicCommandResult<ActionResponsePresentationEnvelopeDTO>;
export type ActionResponsesSeenMutationResult =
  ActionCoordinationAtomicCommandResult<ActionResponsesSeenEnvelopeDTO>;

export class ActionResponsesCursorError extends Error {
  readonly code = "INVALID_CURSOR" as const;

  constructor() {
    super("The responses cursor is invalid or belongs to another collection.");
    this.name = "ActionResponsesCursorError";
  }
}

export class ActionResponsesCursorExpiredError extends Error {
  readonly code = "CURSOR_EXPIRED" as const;

  constructor() {
    super("The responses snapshot expired. Refresh the collection.");
    this.name = "ActionResponsesCursorExpiredError";
  }
}

export type ActionResponseServiceDependencies = Readonly<{
  db?: PrismaClient;
  clock?: ActionCoordinationClock;
  transactionOptions?: ActionCoordinationTransactionOptions;
  snapshotTtlMs?: number;
  reservationEnrollmentAllowed?: () => boolean;
  reservationCreatorEligible?: (
    creator: Readonly<{
      id: string;
      email: string | null;
      username: string;
    }>,
    tx: Prisma.TransactionClient,
  ) => Promise<boolean>;
}>;

type ResponseToken = Readonly<{
  version: 1;
  snapshotId: string;
  actorHash: string;
  actionIdFilter: string | null;
  presentation: ActionResponsePresentationFilter;
}>;

type ResponseCursor = ResponseToken & Readonly<{ nextOrdinal: number }>;

type SnapshotMembershipRow = {
  interestId: string;
  activationId: string;
  actionId: string;
  activationStartedAt: Date;
  hiddenAt: Date | null;
  viewedAt: Date | null;
};

type LiveCountRow = {
  actionId: string;
  total: bigint | number;
  visible: bigint | number;
  unseenVisible: bigint | number;
  latestActivationAt: Date;
};

const responseItemSelect = Prisma.validator<Prisma.ActionInterestSelect>()({
  id: true,
  userId: true,
  status: true,
  user: {
    select: {
      id: true,
      username: true,
      nickname: true,
      avatarUrl: true,
      verifiedStudent: true,
      school: true,
      onboardingComplete: true,
      isGuest: true,
    },
  },
  classmatePost: {
    select: {
      id: true,
      userId: true,
      title: true,
      status: true,
      category: true,
      visibility: true,
      startsAt: true,
      endsAt: true,
      location: true,
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
          course: { select: { id: true, code: true, name: true } },
        },
        orderBy: { id: "asc" },
      },
    },
  },
  coordinationContext: {
    select: {
      id: true,
      state: true,
      currentActivationId: true,
      reservationId: true,
      leaseExpiresAt: true,
    },
  },
});

type ResponseItemRow = Prisma.ActionInterestGetPayload<{
  select: typeof responseItemSelect;
}>;

type ActiveCoordinationCountRow = {
  actionId: string;
  count: bigint | number;
};

function database(dependencies: ActionResponseServiceDependencies) {
  return dependencies.db ?? prisma;
}

function actorHash(actorId: string): string {
  return createHash("sha256")
    .update("sideseat:action-responses-snapshot:v1\0", "utf8")
    .update(actorId, "utf8")
    .digest("base64url");
}

function encodeToken(value: ResponseToken | ResponseCursor): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function parseOpaqueObject(value: string): Record<string, unknown> {
  if (value.length > 2_048 || !/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new ActionResponsesCursorError();
  }
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new ActionResponsesCursorError();
    }
    return parsed as Record<string, unknown>;
  } catch (cause) {
    if (cause instanceof ActionResponsesCursorError) throw cause;
    throw new ActionResponsesCursorError();
  }
}

function decodeToken(
  value: string,
  actorId: string,
  expected: Readonly<{
    actionIdFilter: string | null;
    presentation: ActionResponsePresentationFilter;
    cursor: boolean;
  }>,
): ResponseToken | ResponseCursor {
  const parsed = parseOpaqueObject(value);
  const expectedKeys = expected.cursor
    ? "actionIdFilter,actorHash,nextOrdinal,presentation,snapshotId,version"
    : "actionIdFilter,actorHash,presentation,snapshotId,version";
  if (Object.keys(parsed).sort().join(",") !== expectedKeys) {
    throw new ActionResponsesCursorError();
  }
  if (
    parsed.version !== 1 ||
    parsed.actorHash !== actorHash(actorId) ||
    parsed.actionIdFilter !== expected.actionIdFilter ||
    parsed.presentation !== expected.presentation ||
    typeof parsed.snapshotId !== "string" ||
    parsed.snapshotId.length === 0
  ) {
    throw new ActionResponsesCursorError();
  }
  if (
    expected.cursor &&
    (typeof parsed.nextOrdinal !== "number" ||
      !Number.isSafeInteger(parsed.nextOrdinal) ||
      parsed.nextOrdinal < 0)
  ) {
    throw new ActionResponsesCursorError();
  }
  return parsed as unknown as ResponseToken | ResponseCursor;
}

function boundedLimit(value: number | undefined): number {
  const limit = value ?? DEFAULT_RESPONSE_PAGE_LIMIT;
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > MAX_RESPONSE_PAGE_LIMIT) {
    throw new RangeError("Responses limit must be between 1 and 50.");
  }
  return limit;
}

function sourceKind(category: string): ProductFunnelSourceKind {
  return category === "SHARED_COURSES" ? "COURSE_ACTION" : "BUDDY_POST";
}

function exactCount(value: bigint | number): number {
  const result = typeof value === "bigint" ? Number(value) : value;
  if (!Number.isSafeInteger(result) || result < 0) {
    throw new Error("Action response count exceeded the supported range.");
  }
  return result;
}

function countsDTO(row?: LiveCountRow): ActionResponseCountsDTO {
  return {
    totalActiveInterestCount: row ? exactCount(row.total) : 0,
    visibleInterestCount: row ? exactCount(row.visible) : 0,
    unseenVisibleInterestCount: row ? exactCount(row.unseenVisible) : 0,
  };
}

const activeResponsePredicate = Prisma.sql`
  interest."status" = CAST('ACTIVE' AS "ActionInterestStatus")
  AND (
    (
      context."state" IN (
        CAST('WAITING' AS "ActionCoordinationState"),
        CAST('INITIATING' AS "ActionCoordinationState")
      )
      AND action."status" IN (
        CAST('ACTIVE' AS "ClassmatePostStatus"),
        CAST('CLOSED' AS "ClassmatePostStatus")
      )
    )
    OR (
      context."state" = CAST('OPEN' AS "ActionCoordinationState")
      AND action."status" IN (
        CAST('ACTIVE' AS "ClassmatePostStatus"),
        CAST('CLOSED' AS "ClassmatePostStatus"),
        CAST('EXPIRED' AS "ClassmatePostStatus")
      )
    )
  )
`;

// A safety transition replaces the immutable v1 Action snapshot with a v2
// privacy tombstone. Current Block/moderation rows may later be removed, but
// that durable tombstone is never reversible and must independently exclude
// the response from every creator-active read model.
const liveOriginSnapshotPredicate = Prisma.sql`
  interest."originSnapshot" ->> 'version' = '1'
  AND interest."originSnapshot" ->> 'kind' IS NULL
`;

const safetyResponsePredicate = Prisma.sql`
  NOT EXISTS (
    SELECT 1 FROM "Block" blocked
    WHERE (
      blocked."blockerId" = action."userId"
      AND blocked."blockedId" = interest."userId"
    ) OR (
      blocked."blockerId" = interest."userId"
      AND blocked."blockedId" = action."userId"
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM "ModerationBlock" moderation
    WHERE moderation."isActive" = TRUE
      AND moderation."userId" IN (action."userId", interest."userId")
  )
`;

async function sampledNow(
  tx: Prisma.TransactionClient,
  clock: ActionCoordinationClock,
): Promise<Date> {
  const now = new Date(await clock.now(tx));
  if (!Number.isFinite(now.getTime())) {
    throw new Error("Action response clock returned an invalid timestamp.");
  }
  return now;
}

async function requireOwnedAction(
  tx: Prisma.TransactionClient,
  actorId: string,
  actionId: string,
  lock: boolean,
) {
  if (lock) {
    await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "ClassmatePost"
      WHERE "id" = ${actionId}
      FOR UPDATE
    `);
  }
  const action = await tx.classmatePost.findFirst({
    where: {
      id: actionId,
      userId: actorId,
      coordinationPolicy: "CREATOR_GATED_V2",
    },
    select: {
      id: true,
      userId: true,
      status: true,
      category: true,
      policySchemaVersion: true,
      experimentKeySnapshot: true,
      experimentVariantSnapshot: true,
    },
  });
  if (!action) throw safetyUnavailable(404);
  return action;
}

async function revalidateSnapshotMembershipSafety(
  tx: Prisma.TransactionClient,
  actorId: string,
  interestIds: readonly string[],
): Promise<void> {
  if (interestIds.length === 0) return;
  const rows = await tx.$queryRaw<Array<{ interestId: string }>>(Prisma.sql`
    SELECT interest."id" AS "interestId"
    FROM "ActionInterest" interest
    INNER JOIN "ClassmatePost" action
      ON action."id" = interest."classmatePostId"
    WHERE interest."id" IN (${Prisma.join(interestIds)})
      AND action."userId" = ${actorId}
      AND action."coordinationPolicy" = CAST(
        'CREATOR_GATED_V2' AS "ActionCoordinationPolicy"
      )
      AND action."status" <> CAST('REMOVED' AS "ClassmatePostStatus")
      AND ${liveOriginSnapshotPredicate}
      AND ${safetyResponsePredicate}
  `);
  if (rows.length !== interestIds.length) throw safetyUnavailable(404);
}

async function liveCountRows(
  tx: Prisma.TransactionClient,
  actorId: string,
  actionId?: string | null,
): Promise<LiveCountRow[]> {
  const actionFilter = actionId
    ? Prisma.sql`AND action."id" = ${actionId}`
    : Prisma.empty;
  return tx.$queryRaw<LiveCountRow[]>(Prisma.sql`
    SELECT
      action."id" AS "actionId",
      COUNT(*) AS "total",
      COUNT(*) FILTER (WHERE presentation."hiddenAt" IS NULL) AS "visible",
      COUNT(*) FILTER (
        WHERE presentation."hiddenAt" IS NULL
          AND receipt."id" IS NULL
      ) AS "unseenVisible",
      MAX(activation."startedAt") AS "latestActivationAt"
    FROM "ActionInterest" interest
    INNER JOIN "ClassmatePost" action
      ON action."id" = interest."classmatePostId"
    INNER JOIN "ActionCoordinationContext" context
      ON context."interestId" = interest."id"
    INNER JOIN "ActionInterestActivation" activation
      ON activation."id" = context."currentActivationId"
    LEFT JOIN "ActionInterestPresentation" presentation
      ON presentation."interestId" = interest."id"
      AND presentation."creatorId" = action."userId"
    LEFT JOIN "ActionInterestViewReceipt" receipt
      ON receipt."activationId" = activation."id"
      AND receipt."creatorId" = action."userId"
    WHERE action."userId" = ${actorId}
      AND action."coordinationPolicy" = CAST(
        'CREATOR_GATED_V2' AS "ActionCoordinationPolicy"
      )
      ${actionFilter}
      AND ${activeResponsePredicate}
      AND ${liveOriginSnapshotPredicate}
      AND ${safetyResponsePredicate}
    GROUP BY action."id"
    ORDER BY
      (COUNT(*) FILTER (
        WHERE presentation."hiddenAt" IS NULL AND receipt."id" IS NULL
      ) > 0) DESC,
      MAX(activation."startedAt") DESC,
      action."id" ASC
  `);
}

async function snapshotMembership(
  tx: Prisma.TransactionClient,
  actorId: string,
  actionId?: string | null,
): Promise<SnapshotMembershipRow[]> {
  const actionFilter = actionId
    ? Prisma.sql`AND action."id" = ${actionId}`
    : Prisma.empty;
  return tx.$queryRaw<SnapshotMembershipRow[]>(Prisma.sql`
    SELECT
      interest."id" AS "interestId",
      activation."id" AS "activationId",
      action."id" AS "actionId",
      activation."startedAt" AS "activationStartedAt",
      presentation."hiddenAt" AS "hiddenAt",
      receipt."viewedAt" AS "viewedAt"
    FROM "ActionInterest" interest
    INNER JOIN "ClassmatePost" action
      ON action."id" = interest."classmatePostId"
    INNER JOIN "ActionCoordinationContext" context
      ON context."interestId" = interest."id"
    INNER JOIN "ActionInterestActivation" activation
      ON activation."id" = context."currentActivationId"
    LEFT JOIN "ActionInterestPresentation" presentation
      ON presentation."interestId" = interest."id"
      AND presentation."creatorId" = action."userId"
    LEFT JOIN "ActionInterestViewReceipt" receipt
      ON receipt."activationId" = activation."id"
      AND receipt."creatorId" = action."userId"
    WHERE action."userId" = ${actorId}
      AND action."coordinationPolicy" = CAST(
        'CREATOR_GATED_V2' AS "ActionCoordinationPolicy"
      )
      ${actionFilter}
      AND ${activeResponsePredicate}
      AND ${liveOriginSnapshotPredicate}
      AND ${safetyResponsePredicate}
    ORDER BY
      BOOL_OR(
        presentation."hiddenAt" IS NULL AND receipt."id" IS NULL
      ) OVER (PARTITION BY action."id") DESC,
      MAX(activation."startedAt") OVER (PARTITION BY action."id") DESC,
      action."id" ASC,
      activation."startedAt" ASC,
      interest."id" ASC
  `);
}

async function requireSnapshot(
  tx: Prisma.TransactionClient,
  token: ResponseToken | ResponseCursor,
  actorId: string,
  now: Date,
) {
  const snapshot = await tx.actionResponseSnapshot.findUnique({
    where: { id: token.snapshotId },
    select: {
      id: true,
      creatorId: true,
      actionIdFilter: true,
      hiddenFilter: true,
      createdAt: true,
      expiresAt: true,
    },
  });
  const hiddenFilter = token.presentation === "HIDDEN";
  if (
    !snapshot ||
    snapshot.creatorId !== actorId ||
    snapshot.actionIdFilter !== token.actionIdFilter ||
    snapshot.hiddenFilter !== hiddenFilter
  ) {
    throw new ActionResponsesCursorError();
  }
  if (snapshot.expiresAt.getTime() <= now.getTime()) {
    throw new ActionResponsesCursorExpiredError();
  }
  return snapshot;
}

function snapshotCounts(
  items: readonly {
    actionId: string;
    hiddenAtSnapshot: Date | null;
    viewedAtSnapshot: Date | null;
  }[],
): Map<string, ActionResponseCountsDTO> {
  const values = new Map<
    string,
    { total: number; visible: number; unseenVisible: number }
  >();
  for (const item of items) {
    const current = values.get(item.actionId) ?? {
      total: 0,
      visible: 0,
      unseenVisible: 0,
    };
    current.total += 1;
    if (item.hiddenAtSnapshot === null) {
      current.visible += 1;
      if (item.viewedAtSnapshot === null) current.unseenVisible += 1;
    }
    values.set(item.actionId, current);
  }
  return new Map(
    [...values].map(([actionId, value]) => [
      actionId,
      {
        totalActiveInterestCount: value.total,
        visibleInterestCount: value.visible,
        unseenVisibleInterestCount: value.unseenVisible,
      },
    ]),
  );
}

async function activeCoordinationCounts(
  tx: Prisma.TransactionClient,
  actionIds: readonly string[],
): Promise<Map<string, number>> {
  if (actionIds.length === 0) return new Map();
  const rows = await tx.$queryRaw<ActiveCoordinationCountRow[]>(Prisma.sql`
    SELECT interest."classmatePostId" AS "actionId", COUNT(*) AS "count"
    FROM "ActionCoordinationContext" context
    INNER JOIN "ActionInterest" interest ON interest."id" = context."interestId"
    WHERE interest."classmatePostId" IN (${Prisma.join(actionIds)})
      AND context."state" IN (
        CAST('INITIATING' AS "ActionCoordinationState"),
        CAST('OPEN' AS "ActionCoordinationState")
      )
    GROUP BY interest."classmatePostId"
  `);
  return new Map(rows.map((row) => [row.actionId, exactCount(row.count)]));
}

async function actionsWithPendingPlan(
  tx: Prisma.TransactionClient,
  actionIds: readonly string[],
): Promise<Set<string>> {
  if (actionIds.length === 0) return new Set();
  const rows = await tx.planCommitment.findMany({
    where: {
      originActionId: { in: [...actionIds] },
      currentPendingRevisionId: { not: null },
      status: { in: ["NEGOTIATING", "CONFIRMED"] },
    },
    select: { originActionId: true },
  });
  return new Set(
    rows.flatMap((row) => (row.originActionId ? [row.originActionId] : [])),
  );
}

function snapshottedCoordinationCap(row: ResponseItemRow): number | null {
  const action = row.classmatePost;
  if (actionPolicyTupleKind(action) !== "SNAPSHOTTED_CREATOR_GATED") {
    return null;
  }
  const parameters = action.policyParametersSnapshot;
  if (!parameters || typeof parameters !== "object" || Array.isArray(parameters)) {
    return null;
  }
  const value = parameters.maxActiveCoordinations;
  return Number.isSafeInteger(value) && (value as number) > 0
    ? (value as number)
    : null;
}

function startCoordinationEligibility(options: {
  row: ResponseItemRow;
  now: Date;
  enrollmentAllowed: boolean;
  currentAudienceEligible: boolean;
  activeCoordinationCount: number;
  hasPendingPlan: boolean;
}): Readonly<{
  canStartCoordination: boolean;
  startCoordinationUnavailableReason:
    | ActionResponseCoordinationUnavailableReason
    | null;
}> {
  const { row } = options;
  const action = row.classmatePost;
  const context = row.coordinationContext;
  if (row.status !== "ACTIVE") {
    return {
      canStartCoordination: false,
      startCoordinationUnavailableReason: "INTEREST_NOT_ACTIVE",
    };
  }
  if (
    !context ||
    (context.state !== "WAITING" && context.state !== "INITIATING")
  ) {
    return {
      canStartCoordination: false,
      startCoordinationUnavailableReason: "INTEREST_ALREADY_COORDINATING",
    };
  }
  if (
    context.state === "INITIATING" &&
    (!context.reservationId || !context.leaseExpiresAt)
  ) {
    return {
      canStartCoordination: false,
      startCoordinationUnavailableReason: "COORDINATION_START_UNAVAILABLE",
    };
  }
  if (action.status === "FULFILLED" || action.fulfilledByPlanId !== null) {
    return {
      canStartCoordination: false,
      startCoordinationUnavailableReason: "ACTION_FULFILLED",
    };
  }
  if (
    action.status === "EXPIRED" ||
    action.expiresAt.getTime() <= options.now.getTime() ||
    (action.endsAt !== null && action.endsAt.getTime() <= options.now.getTime())
  ) {
    return {
      canStartCoordination: false,
      startCoordinationUnavailableReason: "ACTION_EXPIRED",
    };
  }
  if (action.status !== "ACTIVE" && action.status !== "CLOSED") {
    return {
      canStartCoordination: false,
      startCoordinationUnavailableReason: "COORDINATION_START_UNAVAILABLE",
    };
  }
  const cap = snapshottedCoordinationCap(row);
  if (cap === null) {
    return {
      canStartCoordination: false,
      startCoordinationUnavailableReason: "COORDINATION_POLICY_UNSUPPORTED",
    };
  }
  if (!options.enrollmentAllowed || !options.currentAudienceEligible) {
    return {
      canStartCoordination: false,
      startCoordinationUnavailableReason: "COORDINATION_START_UNAVAILABLE",
    };
  }
  if (options.hasPendingPlan) {
    return {
      canStartCoordination: false,
      startCoordinationUnavailableReason: "ACTION_PLAN_PENDING",
    };
  }
  // Resuming an existing shell does not reserve a second slot. Exclude this
  // Context from the current count while still failing closed if other active
  // coordinations alone already reach the snapshotted cap.
  const otherActiveCoordinations = Math.max(
    0,
    options.activeCoordinationCount - (context.state === "INITIATING" ? 1 : 0),
  );
  if (otherActiveCoordinations >= cap) {
    return {
      canStartCoordination: false,
      startCoordinationUnavailableReason: "COORDINATION_LIMIT_REACHED",
    };
  }
  return {
    canStartCoordination: true,
    startCoordinationUnavailableReason: null,
  };
}

async function currentReservationCreatorEligible(
  tx: Prisma.TransactionClient,
  creator: Readonly<{
    id: string;
    email: string | null;
    username: string;
  }>,
  dependencies: ActionResponseServiceDependencies,
): Promise<boolean> {
  if (dependencies.reservationCreatorEligible) {
    return dependencies.reservationCreatorEligible(creator, tx);
  }
  if (!isV2PilotUser(creator)) return false;
  const assignment = await tx.experimentAssignment.findUnique({
    where: {
      userId_experimentKey: {
        userId: creator.id,
        experimentKey: CREATOR_GATED_ACTION_EXPERIMENT_KEY,
      },
    },
    select: { eligible: true, variant: true },
  });
  return assignment?.eligible === true && assignment.variant === "TREATMENT";
}

function currentResponseAudienceEligible(options: {
  row: ResponseItemRow;
  sharedCourse: ActionResponseCourseDTO | null;
}): boolean {
  const { row, sharedCourse } = options;
  const action = row.classmatePost;
  const responderSchool = normalizeSchoolCode(row.user.school);
  const creatorSchool = normalizeSchoolCode(action.user.school);
  const sameSchool =
    responderSchool !== null && responderSchool === creatorSchool;
  const visible =
    action.visibility === "CITY_INTERNATIONALS" ||
    (action.visibility === "VERIFIED_ONLY" && row.user.verifiedStudent) ||
    (action.visibility === "SCHOOL_ONLY" && sameSchool) ||
    (action.visibility === "COURSEMATES_ONLY" && sharedCourse !== null);
  const courseEligible =
    action.category !== "SHARED_COURSES" ||
    (action.courses.length === 1 && sharedCourse !== null);
  return (
    !row.user.isGuest &&
    row.user.onboardingComplete &&
    !action.user.isGuest &&
    action.user.onboardingComplete &&
    visible &&
    courseEligible
  );
}

async function renderResponsePage(
  tx: Prisma.TransactionClient,
  options: Readonly<{
    actorId: string;
    snapshot: {
      id: string;
      createdAt: Date;
      expiresAt: Date;
      actionIdFilter: string | null;
    };
    presentation: ActionResponsePresentationFilter;
    startOrdinal: number;
    limit: number;
    now: Date;
    reservationEnrollmentAllowed: boolean;
    reservationCreatorEligible: boolean;
  }>,
): Promise<ActionResponsesEnvelopeDTO> {
  const allItems = await tx.actionResponseSnapshotItem.findMany({
    where: { snapshotId: options.snapshot.id },
    orderBy: { sortOrdinal: "asc" },
    select: {
      interestId: true,
      activationId: true,
      actionId: true,
      sortOrdinal: true,
      hiddenAtSnapshot: true,
      viewedAtSnapshot: true,
      latestActivationAtSnapshot: true,
    },
  });
  const rendered = allItems.filter((item) =>
    options.presentation === "VISIBLE"
      ? item.hiddenAtSnapshot === null
      : item.hiddenAtSnapshot !== null,
  );
  const remaining = rendered.filter(
    (item) => item.sortOrdinal >= options.startOrdinal,
  );
  const pageItems = remaining.slice(0, options.limit);
  // A page's counts cover the complete frozen membership. Safety therefore
  // revalidates that complete membership before rendering any page; checking
  // only pageItems could leak an off-page blocked/moderated row through counts.
  await revalidateSnapshotMembershipSafety(
    tx,
    options.actorId,
    allItems.map((item) => item.interestId),
  );
  const byInterest = new Map(
    (
      await tx.actionInterest.findMany({
        where: { id: { in: pageItems.map((item) => item.interestId) } },
        select: responseItemSelect,
      })
    ).map((row) => [row.id, row]),
  );
  const actionIds = [...new Set(pageItems.map((item) => item.actionId))];
  const [coordinationCounts, pendingPlanActionIds] = await Promise.all([
    activeCoordinationCounts(tx, actionIds),
    actionsWithPendingPlan(tx, actionIds),
  ]);
  const counts = snapshotCounts(allItems);
  const groups = new Map<string, ActionResponseGroupDTO>();

  for (const item of pageItems) {
    const row = byInterest.get(item.interestId);
    if (!row || !row.coordinationContext) {
      throw new Error("A response snapshot item lost its authoritative domain row.");
    }
    const actionCourse = row.classmatePost.courses[0]?.course ?? null;
    let sharedCourse: ActionResponseCourseDTO | null = null;
    for (const actionCourseLink of row.classmatePost.courses) {
      const candidate = await findSharedActiveCourse(
        tx,
        options.actorId,
        row.userId,
        actionCourseLink.course.id,
        options.now,
      );
      if (candidate) {
        sharedCourse = {
          id: candidate.id,
          code: candidate.code,
          name: candidate.name,
        };
        break;
      }
    }
    const startEligibility = startCoordinationEligibility({
      row,
      now: options.now,
      enrollmentAllowed:
        options.reservationEnrollmentAllowed &&
        options.reservationCreatorEligible,
      currentAudienceEligible: currentResponseAudienceEligible({
        row,
        sharedCourse,
      }),
      activeCoordinationCount:
        coordinationCounts.get(row.classmatePost.id) ?? 0,
      hasPendingPlan: pendingPlanActionIds.has(row.classmatePost.id),
    });
    const response: ActionResponseItemDTO = {
      interestId: row.id,
      activationId: item.activationId,
      contextId: row.coordinationContext.id,
      responder: {
        userId: row.user.id,
        displayName: row.user.nickname?.trim() || row.user.username,
        avatarUrl: row.user.avatarUrl,
        verifiedStudent: row.user.verifiedStudent,
      },
      signals: {
        sharedCourse,
        sharedLanguages: [],
      },
      receivedAt: item.latestActivationAtSnapshot.toISOString(),
      viewedAt: item.viewedAtSnapshot?.toISOString() ?? null,
      hiddenAt: item.hiddenAtSnapshot?.toISOString() ?? null,
      interestState: row.status,
      coordinationState: row.coordinationContext.state,
      presentationState:
        item.hiddenAtSnapshot === null ? "VISIBLE" : "HIDDEN",
      ...startEligibility,
    };
    let group = groups.get(row.classmatePost.id);
    if (!group) {
      group = {
        action: {
          id: row.classmatePost.id,
          title: row.classmatePost.title,
          actionState: row.classmatePost.status,
          startsAt: row.classmatePost.startsAt?.toISOString() ?? null,
          endsAt: row.classmatePost.endsAt?.toISOString() ?? null,
          location: row.classmatePost.location,
          course: actionCourse
            ? {
                id: actionCourse.id,
                code: actionCourse.code,
                name: actionCourse.name,
              }
            : null,
        },
        counts: counts.get(row.classmatePost.id) ?? countsDTO(),
        responses: [],
        focus: {
          type: "ACTION_RESPONSES",
          actionId: row.classmatePost.id,
        },
      };
      groups.set(row.classmatePost.id, group);
    }
    group.responses.push(response);
  }

  const token: ResponseToken = {
    version: 1,
    snapshotId: options.snapshot.id,
    actorHash: actorHash(options.actorId),
    actionIdFilter: options.snapshot.actionIdFilter,
    presentation: options.presentation,
  };
  const nextItem = remaining[options.limit];
  const nextCursor = nextItem
    ? encodeToken({ ...token, nextOrdinal: nextItem.sortOrdinal })
    : null;
  return {
    snapshot: {
      token: encodeToken(token),
      createdAt: options.snapshot.createdAt.toISOString(),
      expiresAt: options.snapshot.expiresAt.toISOString(),
    },
    groups: [...groups.values()],
    nextCursor,
  };
}

export async function listCreatorActionResponses(options: {
  actorId: string;
  actionId?: string | null;
  presentation?: ActionResponsePresentationFilter;
  limit?: number;
  cursor?: string | null;
  dependencies?: ActionResponseServiceDependencies;
}): Promise<ActionResponsesEnvelopeDTO> {
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  const presentation = options.presentation ?? "VISIBLE";
  const actionId = options.actionId ?? null;
  const limit = boundedLimit(options.limit);
  const clock = dependencies.clock ?? databaseActionCoordinationClock;
  const transactionOptions = {
    maxWait: dependencies.transactionOptions?.maxWait ?? 5_000,
    timeout: dependencies.transactionOptions?.timeout ?? 15_000,
    isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead,
  } as const;

  return db.$transaction(async (tx) => {
    const now = await sampledNow(tx, clock);
    if (actionId) await requireOwnedAction(tx, options.actorId, actionId, false);

    if (options.cursor) {
      const cursor = decodeToken(options.cursor, options.actorId, {
        actionIdFilter: actionId,
        presentation,
        cursor: true,
      }) as ResponseCursor;
      const snapshot = await requireSnapshot(tx, cursor, options.actorId, now);
      const creator = await tx.user.findUnique({
        where: { id: options.actorId },
        select: { id: true, email: true, username: true },
      });
      const reservationCreatorEligible = creator
        ? await currentReservationCreatorEligible(tx, creator, dependencies)
        : false;
      return renderResponsePage(tx, {
        actorId: options.actorId,
        snapshot,
        presentation,
        startOrdinal: cursor.nextOrdinal,
        limit,
        now,
        reservationEnrollmentAllowed: (
          dependencies.reservationEnrollmentAllowed ??
          isCreatorGatedExperimentEnrollmentEnabled
        )(),
        reservationCreatorEligible,
      });
    }

    const ttlMs = dependencies.snapshotTtlMs ?? ACTION_RESPONSE_SNAPSHOT_TTL_MS;
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new TypeError("Response snapshot TTL must be a positive duration.");
    }
    const expiresAt = new Date(now.getTime() + ttlMs);
    const snapshot = await tx.actionResponseSnapshot.create({
      data: {
        creatorId: options.actorId,
        actionIdFilter: actionId,
        hiddenFilter: presentation === "HIDDEN",
        createdAt: now,
        expiresAt,
      },
      select: {
        id: true,
        actionIdFilter: true,
        createdAt: true,
        expiresAt: true,
      },
    });
    const membership = await snapshotMembership(tx, options.actorId, actionId);
    if (membership.length > 0) {
      await tx.actionResponseSnapshotItem.createMany({
        data: membership.map((row, sortOrdinal) => ({
          snapshotId: snapshot.id,
          interestId: row.interestId,
          activationId: row.activationId,
          actionId: row.actionId,
          sortOrdinal,
          hiddenAtSnapshot: row.hiddenAt,
          viewedAtSnapshot: row.viewedAt,
          hasUnseenVisibleAtSnapshot:
            row.hiddenAt === null && row.viewedAt === null,
          latestActivationAtSnapshot: row.activationStartedAt,
        })),
      });
    }
    const creator = await tx.user.findUnique({
      where: { id: options.actorId },
      select: { id: true, email: true, username: true },
    });
    const reservationCreatorEligible = creator
      ? await currentReservationCreatorEligible(tx, creator, dependencies)
      : false;
    return renderResponsePage(tx, {
      actorId: options.actorId,
      snapshot,
      presentation,
      startOrdinal: 0,
      limit,
      now,
      reservationEnrollmentAllowed: (
        dependencies.reservationEnrollmentAllowed ??
        isCreatorGatedExperimentEnrollmentEnabled
      )(),
      reservationCreatorEligible,
    });
  }, transactionOptions);
}

export async function loadCreatorResponseEntry(options: {
  actorId: string;
  actionId: string;
  dependencies?: ActionResponseServiceDependencies;
}): Promise<CreatorResponseEntryDTO | undefined> {
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  return db.$transaction(async (tx) => {
    const action = await tx.classmatePost.findFirst({
      where: {
        id: options.actionId,
        userId: options.actorId,
        coordinationPolicy: "CREATOR_GATED_V2",
      },
      select: { id: true },
    });
    if (!action) return undefined;
    const row = (await liveCountRows(tx, options.actorId, options.actionId))[0];
    return {
      counts: countsDTO(row),
      focus: { type: "ACTION_RESPONSES", actionId: options.actionId },
    };
  });
}

export async function loadActionResponseSummary(options: {
  actorId: string;
  dependencies?: ActionResponseServiceDependencies;
}): Promise<ActionResponseSummaryDTO | undefined> {
  const db = database(options.dependencies ?? {});
  return db.$transaction(async (tx) => {
    const rows = await liveCountRows(tx, options.actorId);
    const unseen = rows.filter((row) => exactCount(row.unseenVisible) > 0);
    const first = unseen[0];
    if (!first) return undefined;
    return {
      actionCountWithUnseenResponses: unseen.length,
      unseenVisibleInterestCount: unseen.reduce(
        (sum, row) => sum + exactCount(row.unseenVisible),
        0,
      ),
      focus: { type: "ACTION_RESPONSES", actionId: first.actionId },
    };
  });
}

function mutationRequest(options: {
  actorId: string;
  idempotencyKey: string;
  method: "POST" | "PATCH";
  operationId: string;
  resourceKind: "ACTION" | "ACTION_INTEREST";
  resourceId: string;
  body: ActionCoordinationJsonValue;
}) {
  const pathParameters: ActionCoordinationJsonObject =
    options.resourceKind === "ACTION"
      ? { actionId: options.resourceId }
      : { interestId: options.resourceId };
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

function eventAttribution(action: {
  policySchemaVersion: number | null;
  experimentKeySnapshot: string | null;
  experimentVariantSnapshot: "CONTROL" | "TREATMENT" | null;
}) {
  return {
    coordinationPolicy: "CREATOR_GATED_V2" as const,
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

async function lockInterestIds(
  tx: Prisma.TransactionClient,
  interestIds: readonly string[],
): Promise<void> {
  if (interestIds.length === 0) return;
  await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT "id" FROM "ActionInterest"
    WHERE "id" IN (${Prisma.join(interestIds)})
    ORDER BY "id"
    FOR UPDATE
  `);
}

function stableUniqueIds(values: readonly string[]): string[] {
  if (values.length < 1 || values.length > MAX_RESPONSE_PAGE_LIMIT) {
    throw new RangeError("Seen response IDs must contain between 1 and 50 items.");
  }
  const sorted = [...values].sort();
  if (sorted.some((value) => !value || value.length > 128)) {
    throw new TypeError("A response identifier is invalid.");
  }
  if (new Set(sorted).size !== sorted.length) {
    throw new TypeError("Seen response identifiers must be unique.");
  }
  return sorted;
}

export async function markCreatorActionResponsesSeen(options: {
  actorId: string;
  actionId: string;
  snapshotToken: string;
  interestIds: readonly string[];
  idempotencyKey: string;
  dependencies?: ActionResponseServiceDependencies;
}): Promise<ActionResponsesSeenMutationResult> {
  const dependencies = options.dependencies ?? {};
  const ids = stableUniqueIds(options.interestIds);
  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: "POST",
        operationId: "markCreatorActionResponsesSeen",
        resourceKind: "ACTION",
        resourceId: options.actionId,
        body: { snapshotToken: options.snapshotToken, interestIds: ids },
      }),
      execute: async ({ tx, now }) => {
        const action = await requireOwnedAction(
          tx,
          options.actorId,
          options.actionId,
          true,
        );
        const parsed = parseOpaqueObject(options.snapshotToken);
        const presentation = parsed.presentation;
        const actionIdFilter = parsed.actionIdFilter;
        if (
          (presentation !== "VISIBLE" && presentation !== "HIDDEN") ||
          (actionIdFilter !== null && typeof actionIdFilter !== "string")
        ) {
          throw new ActionResponsesCursorError();
        }
        const token = decodeToken(options.snapshotToken, options.actorId, {
          actionIdFilter,
          presentation,
          cursor: false,
        }) as ResponseToken;
        const snapshot = await requireSnapshot(tx, token, options.actorId, now);
        if (
          presentation !== "VISIBLE" ||
          (snapshot.actionIdFilter !== null &&
            snapshot.actionIdFilter !== options.actionId)
        ) {
          throw safetyUnavailable(404);
        }
        const snapshotItems = await tx.actionResponseSnapshotItem.findMany({
          where: {
            snapshotId: snapshot.id,
            actionId: options.actionId,
            interestId: { in: ids },
          },
          select: {
            interestId: true,
            activationId: true,
            hiddenAtSnapshot: true,
          },
        });
        if (
          snapshotItems.length !== ids.length ||
          snapshotItems.some((item) => item.hiddenAtSnapshot !== null)
        ) {
          throw safetyUnavailable(404);
        }
        await lockInterestIds(tx, ids);
        await tx.$queryRaw<Array<{ interestId: string }>>(Prisma.sql`
          SELECT "interestId" FROM "ActionInterestPresentation"
          WHERE "interestId" IN (${Prisma.join(ids)})
          ORDER BY "interestId"
          FOR UPDATE
        `);
        const current = await tx.actionInterest.findMany({
          where: {
            id: { in: ids },
            classmatePostId: options.actionId,
            status: "ACTIVE",
          },
          select: {
            id: true,
            userId: true,
            originSnapshot: true,
            presentation: { select: { hiddenAt: true, creatorId: true } },
            coordinationContext: {
              select: {
                id: true,
                state: true,
                currentActivationId: true,
                currentActivation: {
                  select: { id: true, interestSurface: true },
                },
              },
            },
          },
        });
        const snapshotByInterest = new Map(
          snapshotItems.map((item) => [item.interestId, item]),
        );
        if (
          current.length !== ids.length ||
          current.some((row) => {
            const context = row.coordinationContext;
            const snapshotItem = snapshotByInterest.get(row.id);
            const origin = parseActionOriginSnapshot(row.originSnapshot);
            const actionAccepts =
              ((context?.state === "WAITING" ||
                context?.state === "INITIATING") &&
                (action.status === "ACTIVE" || action.status === "CLOSED")) ||
              (context?.state === "OPEN" &&
                (action.status === "ACTIVE" ||
                  action.status === "CLOSED" ||
                  action.status === "EXPIRED"));
            return (
              !snapshotItem ||
              origin?.kind !== "LIVE" ||
              !context ||
              !actionAccepts ||
              context.currentActivationId !== snapshotItem.activationId ||
              row.presentation?.creatorId !== options.actorId ||
              row.presentation.hiddenAt !== null
            );
          })
        ) {
          throw safetyUnavailable(404);
        }
        const participantIds = current.map((row) => row.userId);
        const unsafe = await tx.block.count({
          where: {
            OR: participantIds.flatMap((responderId) => [
              { blockerId: options.actorId, blockedId: responderId },
              { blockerId: responderId, blockedId: options.actorId },
            ]),
          },
        });
        const moderated = await tx.moderationBlock.count({
          where: {
            isActive: true,
            userId: { in: [options.actorId, ...participantIds] },
          },
        });
        if (unsafe > 0 || moderated > 0) throw safetyUnavailable(404);

        const existing = new Map(
          (
            await tx.actionInterestViewReceipt.findMany({
              where: {
                activationId: {
                  in: snapshotItems.map((item) => item.activationId),
                },
              },
              select: { activationId: true, viewedAt: true },
            })
          ).map((receipt) => [receipt.activationId, receipt.viewedAt]),
        );
        const viewed: ActionResponsesSeenEnvelopeDTO["viewed"] = [];
        for (const row of current.sort((a, b) => a.id.localeCompare(b.id))) {
          const context = row.coordinationContext!;
          const activation = context.currentActivation!;
          let viewedAt = existing.get(activation.id) ?? null;
          if (viewedAt === null) {
            const receipt = await tx.actionInterestViewReceipt.create({
              data: {
                activationId: activation.id,
                interestId: row.id,
                creatorId: options.actorId,
                viewedAt: now,
              },
              select: { id: true, viewedAt: true },
            });
            viewedAt = receipt.viewedAt;
            await recordServerFunnelEvent(tx, {
              businessEventKey: businessFunnelEventKeys.actionResponseViewed(
                receipt.id,
              ),
              actorId: options.actorId,
              name: "ACTION_RESPONSE_VIEWED",
              surface: "ACTION_DETAIL",
              sourceKind: sourceKind(action.category),
              sourceId: options.actionId,
              actionInterestId: row.id,
              interestActivationId: activation.id,
              actionContextId: context.id,
              interestSurface: activation.interestSurface,
              ...eventAttribution(action),
              occurredAt: now,
            });
          }
          viewed.push({
            interestId: row.id,
            activationId: activation.id,
            viewedAt: viewedAt.toISOString(),
          });
        }
        const counts = (await liveCountRows(tx, options.actorId, options.actionId))[0];
        return {
          status: 200,
          body: {
            actionId: options.actionId,
            viewed,
            counts: countsDTO(counts),
          },
        };
      },
    },
    {
      db: database(dependencies),
      clock: dependencies.clock,
      transactionOptions: dependencies.transactionOptions,
    },
  );
}

export async function setCreatorActionInterestPresentation(options: {
  actorId: string;
  interestId: string;
  presentationState: ActionResponsePresentationState;
  idempotencyKey: string;
  dependencies?: ActionResponseServiceDependencies;
}): Promise<ActionResponsePresentationMutationResult> {
  const dependencies = options.dependencies ?? {};
  const db = database(dependencies);
  const discovered = await db.actionInterest.findUnique({
    where: { id: options.interestId },
    select: { classmatePostId: true },
  });
  if (!discovered) throw safetyUnavailable(404);
  const actionId = discovered.classmatePostId;
  return runAtomicActionCoordinationCommand(
    {
      request: mutationRequest({
        actorId: options.actorId,
        idempotencyKey: options.idempotencyKey,
        method: "PATCH",
        operationId: "setCreatorActionInterestPresentation",
        resourceKind: "ACTION_INTEREST",
        resourceId: options.interestId,
        body: { presentationState: options.presentationState },
      }),
      execute: async ({ tx, now }) => {
        const action = await requireOwnedAction(
          tx,
          options.actorId,
          actionId,
          true,
        );
        await lockInterestIds(tx, [options.interestId]);
        const interest = await tx.actionInterest.findFirst({
          where: { id: options.interestId, classmatePostId: actionId },
          select: {
            id: true,
            coordinationContext: { select: { id: true } },
          },
        });
        if (!interest) throw safetyUnavailable(404);
        await tx.actionInterestPresentation.createMany({
          data: [{
            interestId: interest.id,
            creatorId: options.actorId,
            version: 0,
            updatedAt: now,
          }],
          skipDuplicates: true,
        });
        await tx.$queryRaw<Array<{ interestId: string }>>(Prisma.sql`
          SELECT "interestId" FROM "ActionInterestPresentation"
          WHERE "interestId" = ${interest.id}
          FOR UPDATE
        `);
        const presentation =
          await tx.actionInterestPresentation.findUniqueOrThrow({
            where: { interestId: interest.id },
          });
        if (presentation.creatorId !== options.actorId) {
          throw safetyUnavailable(404);
        }
        const currentlyHidden = presentation.hiddenAt !== null;
        const wantsHidden = options.presentationState === "HIDDEN";
        let updated = presentation;
        if (currentlyHidden !== wantsHidden) {
          updated = await tx.actionInterestPresentation.update({
            where: { interestId: interest.id },
            data: {
              hiddenAt: wantsHidden ? now : null,
              version: { increment: 1 },
              updatedAt: now,
            },
          });
          await recordServerFunnelEvent(tx, {
            businessEventKey: wantsHidden
              ? businessFunnelEventKeys.actionResponseHidden(
                  interest.id,
                  updated.version,
                )
              : businessFunnelEventKeys.actionResponseRestored(
                  interest.id,
                  updated.version,
                ),
            actorId: options.actorId,
            name: wantsHidden
              ? "ACTION_RESPONSE_HIDDEN"
              : "ACTION_RESPONSE_RESTORED",
            surface: "ACTION_DETAIL",
            sourceKind: sourceKind(action.category),
            sourceId: actionId,
            actionInterestId: interest.id,
            actionContextId: interest.coordinationContext?.id,
            ...eventAttribution(action),
            occurredAt: now,
          });
        }
        const counts = (await liveCountRows(tx, options.actorId, actionId))[0];
        return {
          status: 200,
          body: {
            presentation: {
              interestId: interest.id,
              presentationState:
                updated.hiddenAt === null ? "VISIBLE" : "HIDDEN",
              hiddenAt: updated.hiddenAt?.toISOString() ?? null,
              version: updated.version,
              updatedAt: updated.updatedAt.toISOString(),
            },
            actionId,
            counts: countsDTO(counts),
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
