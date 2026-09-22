import "server-only";

import {
  type ActionCoordinationPolicy,
  type ClassmatePostCategory,
  type ExperimentVariant,
  type PlanType,
  Prisma,
  type User,
} from "@prisma/client";

import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { normalizeSchoolCode } from "@/lib/constants/schools";
import { userConnectionSafetyLocks } from "@/lib/connections/canonical-connection";
import {
  OpenConversationError,
  openConversationForUser,
} from "@/lib/connections/open-conversation";
import { scheduleNewDirectChatMessageNotification } from "@/lib/push/notify-user";
import {
  parseActionContextSnapshot,
  type ActionContextSnapshot,
} from "@/lib/v2/action-context-snapshot";
import { directContextConflictReason } from "@/lib/v2/action-coordination/capability";
import { pairSafetyLock } from "@/lib/v2/action-coordination/db-locks";
import {
  actionPolicyTupleKind,
  directConversationPolicyTupleKind,
  type ActionPolicyTuple,
} from "@/lib/v2/action-coordination/policy-snapshot";
import {
  businessFunnelEventKeys,
  recordServerFunnelEvent,
} from "@/lib/v2/funnel-events";
import { ACTION_TO_PLAN_EXPERIMENT_KEY } from "@/lib/v2/experiments";

export class ActionInterestError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "CONTENT_RESTRICTED"
      | "INVALID_STATE"
      | "SELF_INTEREST"
      | "CONVERSATION_UNAVAILABLE",
    readonly messageText: string,
  ) {
    super(messageText);
    this.name = "ActionInterestError";
  }
}

export type { ActionContextSnapshot } from "@/lib/v2/action-context-snapshot";

type ActionPolicyAttributionSource = ActionPolicyTuple;

export type ActionFunnelAttribution = Readonly<{
  coordinationPolicy: ActionCoordinationPolicy;
  policySchemaVersion?: number;
  experimentKey?: string;
  experimentVariant?: ExperimentVariant;
}>;

/**
 * Downstream business events inherit the immutable Action snapshot. Only the
 * exact pre-snapshot seven-null legacy shape may fall back to the legacy
 * experiment carried by the endpoint. Any partial or contradictory snapshot
 * fails before Connection, Interest, Message, or funnel writes begin.
 */
export function actionFunnelAttributionFromSnapshot(
  action: ActionPolicyAttributionSource,
  legacyExperimentVariant: ExperimentVariant,
): ActionFunnelAttribution {
  const directTupleKind = directConversationPolicyTupleKind(action);
  if (directTupleKind === "HISTORICAL_UNSNAPSHOTTED") {
    return {
      coordinationPolicy: "DIRECT_CONVERSATION_V1",
      experimentKey: ACTION_TO_PLAN_EXPERIMENT_KEY,
      experimentVariant: legacyExperimentVariant,
    };
  }

  const experiment =
    typeof action.experimentKeySnapshot === "string" &&
    action.experimentVariantSnapshot != null
      ? {
          experimentKey: action.experimentKeySnapshot,
          experimentVariant: action.experimentVariantSnapshot,
        }
      : {};

  if (action.coordinationPolicy === "DIRECT_CONVERSATION_V1") {
    if (directTupleKind !== "SNAPSHOTTED_DIRECT") {
      throw new ActionInterestError(
        "INVALID_STATE",
        "This opportunity has conflicting coordination attribution.",
      );
    }
    return {
      coordinationPolicy: "DIRECT_CONVERSATION_V1",
      policySchemaVersion: 1,
      ...experiment,
    };
  }

  if (actionPolicyTupleKind(action) !== "SNAPSHOTTED_CREATOR_GATED") {
    throw new ActionInterestError(
      "INVALID_STATE",
      "This opportunity has conflicting coordination attribution.",
    );
  }
  return {
    coordinationPolicy: "CREATOR_GATED_V2",
    policySchemaVersion: 1,
    ...experiment,
  };
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

export function actionInterestResponse(interest: {
  id: string;
  status: "ACTIVE" | "WITHDRAWN";
  connectionId: string | null;
  classmatePostId: string;
  originSnapshot: Prisma.JsonValue;
  createdAt: Date;
  updatedAt: Date;
}) {
  if (!interest.connectionId) {
    throw new ActionInterestError(
      "INVALID_STATE",
      "This response belongs to creator-gated coordination and is not a legacy direct interest.",
    );
  }
  const context = requireActionContextSnapshot(interest.originSnapshot);
  return {
    id: interest.id,
    status: interest.status,
    connectionId: interest.connectionId,
    postId: interest.classmatePostId,
    context,
    planDraft: {
      title: context.title,
      startTime: context.startsAt,
      endTime: context.endsAt,
      location: context.location,
      planType: context.planType,
      participantIds: context.participantIds,
      origin: { kind: "ACTION_INTEREST" as const, id: interest.id },
    },
    createdAt: interest.createdAt.toISOString(),
    updatedAt: interest.updatedAt.toISOString(),
  };
}

function requireActionContextSnapshot(
  value: Prisma.JsonValue,
): ActionContextSnapshot {
  const context = parseActionContextSnapshot(value);
  if (!context) {
    throw new ActionInterestError(
      "INVALID_STATE",
      "This response has an invalid immutable Action context.",
    );
  }
  return context;
}

export async function createActionInterest(options: {
  user: User;
  postId: string;
  experimentVariant: ExperimentVariant;
  tx: Prisma.TransactionClient;
}) {
  // The first read only discovers the unordered pair. Every authoritative
  // Action/Interest/Context check is repeated after the pair safety lock.
  const pairSnapshot = await options.tx.classmatePost.findUnique({
    where: { id: options.postId },
    select: { id: true, userId: true },
  });
  if (!pairSnapshot) {
    throw new ActionInterestError("NOT_FOUND", "The opportunity was not found.");
  }
  if (pairSnapshot.userId === options.user.id) {
    throw new ActionInterestError(
      "SELF_INTEREST",
      "You cannot express interest in your own opportunity.",
    );
  }

  await userConnectionSafetyLocks(options.tx, [
    options.user.id,
    pairSnapshot.userId,
  ]);
  await pairSafetyLock(options.tx, options.user.id, pairSnapshot.userId);
  const lockedActions = await options.tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "ClassmatePost"
      WHERE "id" = ${options.postId}
        AND "userId" = ${pairSnapshot.userId}
      FOR UPDATE
    `,
  );
  if (!lockedActions[0]) {
    throw new ActionInterestError("NOT_FOUND", "The opportunity was not found.");
  }

  const now = new Date();
  const [post, viewerCourses] = await Promise.all([
    options.tx.classmatePost.findUnique({
      where: { id: options.postId },
      include: {
        user: {
          select: {
            id: true,
            username: true,
            nickname: true,
            school: true,
            onboardingComplete: true,
          },
        },
        courses: {
          include: {
            course: { select: { id: true, code: true, name: true } },
          },
        },
      },
    }),
    options.tx.userCourse.findMany({
      where: { userId: options.user.id, ...activeCourseMembershipWhere(now) },
      select: { courseId: true },
    }),
  ]);
  if (!post || post.userId !== pairSnapshot.userId) {
    throw new ActionInterestError("NOT_FOUND", "The opportunity was not found.");
  }
  if (
    post.status !== "ACTIVE" ||
    post.expiresAt <= now ||
    (post.endsAt !== null && post.endsAt <= now)
  ) {
    throw new ActionInterestError(
      "INVALID_STATE",
      "This opportunity is no longer open.",
    );
  }

  const viewerCourseIds = new Set(viewerCourses.map((row) => row.courseId));
  const sharedCourse = post.courses.find((row) => viewerCourseIds.has(row.courseId));
  const sameSchool =
    normalizeSchoolCode(options.user.school) !== null &&
    normalizeSchoolCode(options.user.school) === normalizeSchoolCode(post.user.school);
  const canSee =
    post.visibility === "CITY_INTERNATIONALS" ||
    (post.visibility === "VERIFIED_ONLY" && options.user.verifiedStudent) ||
    (post.visibility === "SCHOOL_ONLY" && sameSchool) ||
    (post.visibility === "COURSEMATES_ONLY" && Boolean(sharedCourse));
  if (!canSee) {
    throw new ActionInterestError(
      "CONTENT_RESTRICTED",
      "This opportunity is not available to your account.",
    );
  }

  const actionAttribution = actionFunnelAttributionFromSnapshot(
    post,
    options.experimentVariant,
  );
  if (actionAttribution.coordinationPolicy !== "DIRECT_CONVERSATION_V1") {
    throw new ActionInterestError(
      "INVALID_STATE",
      "This opportunity requires creator-gated coordination.",
    );
  }

  await options.tx.$executeRaw`
    SELECT "id"
    FROM "ActionInterest"
    WHERE "userId" = ${options.user.id}
      AND "classmatePostId" = ${post.id}
    FOR UPDATE
  `;
  const previous = await options.tx.actionInterest.findUnique({
    where: {
      userId_classmatePostId: {
        userId: options.user.id,
        classmatePostId: post.id,
      },
    },
    select: {
      id: true,
      status: true,
      connectionId: true,
    },
  });
  if (previous?.connectionId === null) {
    throw new ActionInterestError(
      "INVALID_STATE",
      "This response belongs to creator-gated coordination.",
    );
  }

  const existingDirectContext = previous
    ? (
        await options.tx.$queryRaw<
          Array<{
            currentActivationId: string | null;
            state: "WAITING" | "INITIATING" | "OPEN" | "ENDED" | "UNAVAILABLE";
            reservationId: string | null;
            reservationGeneration: number;
            leaseExpiresAt: Date | null;
            connectionId: string | null;
            activatedAt: Date | null;
            firstCounterpartResponseAt: Date | null;
            endedAt: Date | null;
            endedById: string | null;
            endReason: string | null;
            createdAt: Date;
          }>
        >(Prisma.sql`
          SELECT
            "currentActivationId",
            "state",
            "reservationId",
            "reservationGeneration",
            "leaseExpiresAt",
            "connectionId",
            "activatedAt",
            "firstCounterpartResponseAt",
            "endedAt",
            "endedById",
            "endReason",
            "createdAt"
          FROM "ActionCoordinationContext"
          WHERE "interestId" = ${previous.id}
          FOR UPDATE
        `)
      )[0] ?? null
    : null;

  let opened;
  try {
    opened = await openConversationForUser(
      options.user,
      {
        peerId: post.userId,
        courseId: sharedCourse?.courseId,
        postId: post.id,
      },
      options.tx,
    );
  } catch (cause) {
    if (cause instanceof OpenConversationError) {
      throw new ActionInterestError(
        "CONVERSATION_UNAVAILABLE",
        "A conversation could not be opened for this opportunity.",
      );
    }
    throw cause;
  }

  const sourceKind =
    post.category === "SHARED_COURSES" ? "COURSE_ACTION" : "BUDDY_POST";
  const course = sharedCourse?.course ?? post.courses[0]?.course ?? null;
  const snapshot: ActionContextSnapshot = {
    version: 1,
    sourceKind,
    sourceId: post.id,
    title: post.title,
    startsAt: post.startsAt?.toISOString() ?? null,
    endsAt: post.endsAt?.toISOString() ?? null,
    location: post.location,
    planType: planTypeForCategory(post.category),
    participantIds: [options.user.id, post.userId],
    author: {
      id: post.userId,
      displayName: post.user.nickname?.trim() || post.user.username,
    },
    course: course
      ? { id: course.id, code: course.code, name: course.name }
      : null,
  };

  const interest = await options.tx.actionInterest.upsert({
    where: {
      userId_classmatePostId: {
        userId: options.user.id,
        classmatePostId: post.id,
      },
    },
    create: {
      userId: options.user.id,
      classmatePostId: post.id,
      connectionId: opened.connectionId,
      status: "ACTIVE",
      originSnapshot: snapshot,
      directTransitionGeneration: 1,
    },
    update: {
      status: "ACTIVE",
      withdrawnAt: null,
      ...(previous?.status === "WITHDRAWN"
        ? { directTransitionGeneration: { increment: 1 } }
        : {}),
    },
  });
  if (
    !interest.connectionId ||
    interest.connectionId !== opened.connectionId
  ) {
    throw new ActionInterestError(
      "INVALID_STATE",
      "This response has conflicting conversation state.",
    );
  }
  const interestContext = requireActionContextSnapshot(interest.originSnapshot);

  // DIRECT_V1 still opens its Connection immediately, but keeping a Context
  // beside every new/reactivated legacy Interest prevents the one-time DB-03
  // backfill from drifting. It intentionally has no Activation or inferred
  // first-content/Connect facts. Existing Interest/Context rows were locked
  // before entering the Connection level; rechecking the Connection here keeps
  // a concurrent legacy end/block from leaving an OPEN compatibility row beside
  // a terminal Connection.
  const lockedConnections = await options.tx.$queryRaw<
    Array<{
      id: string;
      userAId: string;
      userBId: string;
      status: "ACTIVE" | "ENDED" | "BLOCKED";
    }>
  >(Prisma.sql`
    SELECT "id", "userAId", "userBId", "status"
    FROM "Connection"
    WHERE "id" = ${opened.connectionId}
    FOR UPDATE
  `);
  const lockedConnection = lockedConnections[0];
  const expectedParticipants = new Set([options.user.id, post.userId]);
  if (
    !lockedConnection ||
    lockedConnection.status !== "ACTIVE" ||
    lockedConnection.userAId === lockedConnection.userBId ||
    !expectedParticipants.has(lockedConnection.userAId) ||
    !expectedParticipants.has(lockedConnection.userBId)
  ) {
    throw new ActionInterestError(
      "CONVERSATION_UNAVAILABLE",
      "The conversation is no longer available for this response.",
    );
  }
  const directContextConflict = directContextConflictReason(
    existingDirectContext,
    opened.connectionId,
    interest.createdAt,
  );
  if (directContextConflict) {
    throw new ActionInterestError(
      "INVALID_STATE",
      "This response has conflicting coordination state.",
    );
  }
  await options.tx.actionCoordinationContext.upsert({
    where: { interestId: interest.id },
    create: {
      interestId: interest.id,
      currentActivationId: null,
      state: "OPEN",
      connectionId: opened.connectionId,
      createdAt: interest.createdAt,
      activatedAt: interest.createdAt,
      updatedAt: interest.updatedAt,
    },
    update: {
      updatedAt: interest.updatedAt,
    },
  });

  let messageId: string | null = null;
  if (!previous || previous.status === "WITHDRAWN") {
    // A DIRECT Interest owns one canonical source card for its whole lifetime.
    // Reactivation reuses the earliest card rather than growing duplicate cards
    // in the same thread. The pair/Interest locks above serialize this lookup.
    const effectiveCards = await options.tx.message.findMany({
      where: {
        type: "ACTION_INTEREST_CARD",
        OR: [
          { actionInterestId: interest.id },
          {
            actionContext: {
              is: { interestId: interest.id },
            },
          },
        ],
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 2,
      select: {
        id: true,
        connectionId: true,
        actionInterestId: true,
        actionContext: { select: { interestId: true } },
        createdAt: true,
      },
    });
    if (effectiveCards.length > 1) {
      throw new ActionInterestError(
        "INVALID_STATE",
        "This response has conflicting source-card history.",
      );
    }
    const effectiveCard = effectiveCards[0] ?? null;
    if (
      effectiveCard &&
      (effectiveCard.connectionId !== opened.connectionId ||
        (effectiveCard.actionInterestId !== null &&
          effectiveCard.actionInterestId !== interest.id) ||
        (effectiveCard.actionContext !== null &&
          effectiveCard.actionContext.interestId !== interest.id))
    ) {
      throw new ActionInterestError(
        "INVALID_STATE",
        "This response has conflicting source-card attribution.",
      );
    }
    const existingCard =
      effectiveCard && effectiveCard.actionInterestId === null
        ? await options.tx.message.update({
            where: { id: effectiveCard.id },
            data: { actionInterestId: interest.id },
            select: { id: true, createdAt: true },
          })
        : effectiveCard;
    const message =
      existingCard ??
      (await options.tx.message.create({
        data: {
          connectionId: opened.connectionId,
          senderId: options.user.id,
          body: "",
          type: "ACTION_INTEREST_CARD",
          actionInterestId: interest.id,
        },
        select: { id: true, createdAt: true },
      }));
    messageId = message.id;
    const directInterestedWhere = {
      actionInterestId: interest.id,
      name: "ACTION_INTERESTED" as const,
      businessEventKey: { not: null },
    };
    const latestInterestedTransition =
      await options.tx.productFunnelEvent.findFirst({
        where: directInterestedWhere,
        orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
        select: { occurredAt: true },
      });
    const transitionOccurredAt =
      latestInterestedTransition &&
      interest.updatedAt <= latestInterestedTransition.occurredAt
        ? new Date(latestInterestedTransition.occurredAt.getTime() + 1)
        : interest.updatedAt;
    await recordServerFunnelEvent(
      options.tx,
      {
        businessEventKey: businessFunnelEventKeys.directTransitionInterested(
          interest.id,
          interest.directTransitionGeneration,
        ),
        actorId: options.user.id,
        name: "ACTION_INTERESTED",
        surface: "ACTION_DETAIL",
        sourceKind: interestContext.sourceKind,
        sourceId: post.id,
        connectionId: opened.connectionId,
        actionInterestId: interest.id,
        interestSurface: "ACTION_DETAIL",
        ...actionAttribution,
        occurredAt: transitionOccurredAt,
      },
    );
    if (opened.created) {
      await recordServerFunnelEvent(
        options.tx,
        {
          businessEventKey: businessFunnelEventKeys.conversationOpened(
            opened.connectionId,
          ),
          actorId: options.user.id,
          name: "CONVERSATION_OPENED",
          surface: "ACTION_DETAIL",
          sourceKind: interestContext.sourceKind,
          sourceId: post.id,
          connectionId: opened.connectionId,
          ...actionAttribution,
          occurredAt: message.createdAt,
        },
      );
    }
  }

  return {
    interest: actionInterestResponse(interest),
    messageId,
    notification: previous?.status === "ACTIVE"
      ? null
      : {
          connectionId: opened.connectionId,
          senderId: options.user.id,
          bodyPreview: `Interested in: ${post.title}`,
        },
  };
}

export async function withdrawActionInterest(options: {
  userId: string;
  postId: string;
  experimentVariant: ExperimentVariant;
  tx: Prisma.TransactionClient;
}) {
  const pairSnapshot = await options.tx.actionInterest.findUnique({
    where: {
      userId_classmatePostId: {
        userId: options.userId,
        classmatePostId: options.postId,
      },
    },
    select: {
      id: true,
      classmatePost: { select: { userId: true } },
    },
  });
  if (!pairSnapshot) {
    throw new ActionInterestError("NOT_FOUND", "Interest was not found.");
  }
  if (pairSnapshot.classmatePost.userId === options.userId) {
    throw new ActionInterestError(
      "INVALID_STATE",
      "This response has invalid participants.",
    );
  }

  await userConnectionSafetyLocks(options.tx, [
    options.userId,
    pairSnapshot.classmatePost.userId,
  ]);
  await pairSafetyLock(
    options.tx,
    options.userId,
    pairSnapshot.classmatePost.userId,
  );
  const lockedActions = await options.tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "ClassmatePost"
      WHERE "id" = ${options.postId}
        AND "userId" = ${pairSnapshot.classmatePost.userId}
      FOR UPDATE
    `,
  );
  if (!lockedActions[0]) {
    throw new ActionInterestError("NOT_FOUND", "Interest was not found.");
  }
  const lockedInterests = await options.tx.$queryRaw<Array<{ id: string }>>(
    Prisma.sql`
      SELECT "id"
      FROM "ActionInterest"
      WHERE "id" = ${pairSnapshot.id}
        AND "userId" = ${options.userId}
        AND "classmatePostId" = ${options.postId}
      FOR UPDATE
    `,
  );
  if (!lockedInterests[0]) {
    throw new ActionInterestError("NOT_FOUND", "Interest was not found.");
  }

  const interest = await options.tx.actionInterest.findUnique({
    where: { id: pairSnapshot.id },
    include: {
      classmatePost: {
        select: {
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
  });
  if (!interest) {
    throw new ActionInterestError("NOT_FOUND", "Interest was not found.");
  }
  const actionAttribution = actionFunnelAttributionFromSnapshot(
    interest.classmatePost,
    options.experimentVariant,
  );
  if (actionAttribution.coordinationPolicy !== "DIRECT_CONVERSATION_V1") {
    throw new ActionInterestError(
      "INVALID_STATE",
      "This response must be managed through creator-gated coordination.",
    );
  }
  if (!interest.connectionId) {
    throw new ActionInterestError(
      "INVALID_STATE",
      "This response must be managed through creator-gated coordination.",
    );
  }
  const interestContext = requireActionContextSnapshot(interest.originSnapshot);
  if (interest.status === "WITHDRAWN") {
    return actionInterestResponse(interest);
  }
  const withdrawn = await options.tx.actionInterest.update({
    where: { id: interest.id },
    data: {
      status: "WITHDRAWN",
      withdrawnAt: new Date(),
      directTransitionGeneration: { increment: 1 },
    },
  });
  await recordServerFunnelEvent(
    options.tx,
    {
      businessEventKey: businessFunnelEventKeys.directTransitionWithdrawn(
        interest.id,
        withdrawn.directTransitionGeneration,
      ),
      actorId: options.userId,
      name: "ACTION_INTEREST_WITHDRAWN",
      surface: "ACTION_DETAIL",
      sourceKind: interestContext.sourceKind,
      sourceId: options.postId,
      connectionId: interest.connectionId,
      actionInterestId: interest.id,
      ...actionAttribution,
      occurredAt: withdrawn.withdrawnAt ?? withdrawn.updatedAt,
    },
  );
  return actionInterestResponse(withdrawn);
}

export function scheduleActionInterestNotification(notification: {
  connectionId: string;
  senderId: string;
  bodyPreview: string;
} | null) {
  if (!notification) return;
  scheduleNewDirectChatMessageNotification(notification);
}
