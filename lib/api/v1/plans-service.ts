import "server-only";

import { ConnectionStatus, type PlanType, type Prisma } from "@prisma/client";

import { planRequestV1, planRequestV1Include } from "@/lib/api/v1/plans-dto";
import {
  assertDirectUnrepliedSendAllowed,
  completeDirectReplyGateAfterSend,
  PeerReplyRequiredError,
} from "@/lib/chat/direct-message-service";
import { prisma } from "@/lib/db/prisma";
import {
  acceptLegacyPlanRevision,
  counterLegacyPlanRevision,
  declineLegacyPlanRevision,
  LEGACY_PLAN_POLICY_UNSUPPORTED_MESSAGE,
  LegacyPlanPolicyUnsupportedError,
  type LegacyPlanPolicyRecovery,
  LegacyPlanTransitionConflictError,
  lockLegacyPlanConnectionSafety,
  upsertLegacyPlanOutcome,
} from "@/lib/plans/legacy-plan-commitment-compat";
import { scheduleNewDirectChatMessageNotification } from "@/lib/push/notify-user";
import {
  getAvailabilityDaysForUser,
  isAvailabilityShareActive,
  materializePlanCalendarEntries,
  normalizeAvailabilityIncludedDates,
  rangeFitsAvailability,
} from "@/lib/queries/chat-planning";
import { rangeFitsScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { parseRevealConfigJson } from "@/lib/schedule-share/reveal-config";
import { syncScheduleShareGuestProposalStatus } from "@/lib/schedule-share/create-plan-from-guest-proposal";
import { PUBLIC_SCHEDULE_TIME_UNAVAILABLE } from "@/lib/schedule-share/public-errors";
import {
  businessFunnelEventKeys,
  experimentAttributionForEligibleAssignment,
  recordServerFunnelEvent,
} from "@/lib/v2/funnel-events";
import { ACTION_TO_PLAN_EXPERIMENT_KEY } from "@/lib/v2/experiments";
import { finalizeAcceptedMutualOpportunityPlan } from "@/lib/v2/mutual-opportunity-plan-lifecycle";
import { finalizeStablePlanRevision } from "@/lib/v2/plan-lifecycle-finalizer";

export class PlansServiceError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_REQUEST"
      | "CONFLICT"
      | "CONTENT_RESTRICTED"
      | "PEER_REPLY_REQUIRED"
      | "COORDINATION_POLICY_UNSUPPORTED",
    readonly messageText: string,
    readonly recovery: LegacyPlanPolicyRecovery | null = null,
  ) {
    super(messageText);
    this.name = "PlansServiceError";
  }
}

const legacyParticipantVisibleWhere = {
  OR: [
    { commitmentId: null },
    { commitment: { is: { safetyRestrictedAt: null } } },
  ],
} satisfies Prisma.PlanRequestWhereInput;

export async function listPlansForUser(userId: string) {
  const now = new Date();
  const recentOutcomeCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1_000);
  const rows = await prisma.planRequest.findMany({
    where: {
      connection: {
        status: ConnectionStatus.ACTIVE,
        userA: { moderationBlocks: { none: { isActive: true } } },
        userB: { moderationBlocks: { none: { isActive: true } } },
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      AND: [
        legacyParticipantVisibleWhere,
        { OR: [{ proposerUserId: userId }, { receiverUserId: userId }] },
        {
          OR: [
            { status: "PENDING" },
            { status: "ACCEPTED", endTime: { gt: now } },
            {
              status: "ACCEPTED",
              endTime: { lte: now, gte: recentOutcomeCutoff },
              outcomeResponses: { none: { userId } },
            },
          ],
        },
      ],
    },
    include: planRequestV1Include,
    orderBy: { startTime: "asc" },
    take: 100,
  });
  return rows.map((row) => planRequestV1(row, userId));
}

export async function getPlanRequest(options: {
  userId: string;
  planId: string;
}) {
  const plan = await prisma.planRequest.findFirst({
    where: {
      id: options.planId,
      connection: {
        status: ConnectionStatus.ACTIVE,
        userA: { moderationBlocks: { none: { isActive: true } } },
        userB: { moderationBlocks: { none: { isActive: true } } },
        OR: [{ userAId: options.userId }, { userBId: options.userId }],
      },
      AND: [legacyParticipantVisibleWhere],
    },
    include: planRequestV1Include,
  });
  if (!plan) {
    throw new PlansServiceError("NOT_FOUND", "Plan request not found.");
  }
  return planRequestV1(plan, options.userId);
}

async function recordPlanEvent(
  tx: Prisma.TransactionClient,
  options: {
    actorId: string;
    planRequestId: string;
    connectionId: string;
    name: "PLAN_PROPOSED" | "PLAN_ACCEPTED" | "PLAN_COUNTERED" | "PLAN_DECLINED" | "OUTCOME_RECORDED";
    occurredAt: Date;
  },
) {
  const [assignment, planAttribution] = await Promise.all([
    tx.experimentAssignment.findUnique({
      where: {
        userId_experimentKey: {
          userId: options.actorId,
          experimentKey: ACTION_TO_PLAN_EXPERIMENT_KEY,
        },
      },
      select: { eligible: true, variant: true },
    }),
    tx.planRequest.findUnique({
      where: { id: options.planRequestId },
      select: {
        actionInterestId: true,
        commitmentId: true,
        originAction: {
          select: {
            coordinationPolicy: true,
            policySchemaVersion: true,
            experimentKeySnapshot: true,
            experimentVariantSnapshot: true,
          },
        },
        actionInterest: {
          select: {
            classmatePost: {
              select: {
                coordinationPolicy: true,
                policySchemaVersion: true,
                experimentKeySnapshot: true,
                experimentVariantSnapshot: true,
              },
            },
          },
        },
      },
    }),
  ]);
  const actionSnapshot =
    planAttribution?.originAction ??
    planAttribution?.actionInterest?.classmatePost ??
    null;
  const assignmentAttribution = experimentAttributionForEligibleAssignment(
    ACTION_TO_PLAN_EXPERIMENT_KEY,
    assignment,
  );
  const businessEventKey =
    options.name === "PLAN_PROPOSED"
      ? businessFunnelEventKeys.planProposed(options.planRequestId)
      : options.name === "PLAN_ACCEPTED"
        ? businessFunnelEventKeys.planAccepted(options.planRequestId)
        : options.name === "PLAN_COUNTERED"
          ? businessFunnelEventKeys.planCountered(options.planRequestId)
          : options.name === "PLAN_DECLINED"
            ? businessFunnelEventKeys.planDeclined(options.planRequestId)
            : businessFunnelEventKeys.legacyPlanOutcomeRecorded(
                options.planRequestId,
                options.actorId,
              );
  await recordServerFunnelEvent(
    tx,
    {
      businessEventKey,
      actorId: options.actorId,
      name: options.name,
      surface: options.name === "OUTCOME_RECORDED" ? "PLAN_CENTER" : "CHAT",
      sourceKind: "PLAN",
      sourceId: options.planRequestId,
      planRequestId: options.planRequestId,
      planRevisionId: options.planRequestId,
      actionInterestId: planAttribution?.actionInterestId ?? undefined,
      planCommitmentId: planAttribution?.commitmentId ?? undefined,
      connectionId: options.connectionId,
      coordinationPolicy: actionSnapshot?.coordinationPolicy ?? undefined,
      policySchemaVersion: actionSnapshot?.policySchemaVersion ?? undefined,
      experimentKey: actionSnapshot
        ? (actionSnapshot.experimentKeySnapshot ?? undefined)
        : assignmentAttribution.experimentKey,
      experimentVariant: actionSnapshot
        ? (actionSnapshot.experimentVariantSnapshot ?? undefined)
        : assignmentAttribution.experimentVariant,
      occurredAt: options.occurredAt,
    },
  );
}

export async function createDirectPlanRequest(options: {
  userId: string;
  connectionId: string;
  title: string;
  location?: string | null;
  message?: string | null;
  startTime: string;
  endTime: string;
  planType?: PlanType;
  receiverUserId?: string;
  origin?:
    | { kind: "ACTION_INTEREST"; id: string }
    | { kind: "MUTUAL_OPPORTUNITY"; id: string };
}) {
  const startTime = new Date(options.startTime);
  const endTime = new Date(options.endTime);

  // A Mutual opportunity may be retried after an earlier proposal's start
  // time elapsed. Lazily finalize that stable revision before the serialized
  // creation transaction checks whether the source already has an actionable
  // Plan. Legacy plans are intentionally outside this path.
  if (options.origin?.kind === "MUTUAL_OPPORTUNITY") {
    const pendingSourcePlan = await prisma.planRequest.findFirst({
      where: {
        originKind: "MUTUAL_OPPORTUNITY",
        originId: options.origin.id,
        status: "PENDING",
        commitmentId: { not: null },
      },
      select: { id: true },
      orderBy: { createdAt: "desc" },
    });
    if (pendingSourcePlan) {
      await finalizeStablePlanRevision(pendingSourcePlan.id);
    }
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const connection = await lockLegacyPlanConnectionSafety(tx, {
        connectionId: options.connectionId,
        actorId: options.userId,
        ...(options.receiverUserId
          ? { expectedPeerId: options.receiverUserId }
          : {}),
      });

      const peerUserId =
        connection.userAId === options.userId
          ? connection.userBId
          : connection.userAId;
      if (options.receiverUserId && options.receiverUserId !== peerUserId) {
        throw new PlansServiceError(
          "INVALID_REQUEST",
          "The plan receiver must be the other person in this chat.",
        );
      }

      const receiverUserId = peerUserId;
      const trustedActionOrigin = options.origin?.kind === "ACTION_INTEREST"
        ? await tx.actionInterest.findFirst({
            where: {
              id: options.origin.id,
              connectionId: options.connectionId,
              connection: {
                OR: [{ userAId: options.userId }, { userBId: options.userId }],
              },
            },
            select: {
              id: true,
              originSnapshot: true,
              classmatePost: { select: { coordinationPolicy: true } },
              coordinationContext: {
                select: { id: true, connectionId: true, state: true },
              },
            },
          })
        : null;
      const trustedMutualOrigin = options.origin?.kind === "MUTUAL_OPPORTUNITY"
        ? await tx.mutualOpportunity.findFirst({
            where: {
              id: options.origin.id,
              connectionId: options.connectionId,
              status: "MUTUAL",
              OR: [{ userAId: options.userId }, { userBId: options.userId }],
            },
            select: { id: true, contextSnapshot: true },
          })
        : null;
      if (options.origin && !trustedActionOrigin && !trustedMutualOrigin) {
        throw new PlansServiceError(
          "INVALID_REQUEST",
          "The source opportunity is not available in this conversation.",
        );
      }
      if (trustedMutualOrigin) {
        if (startTime <= new Date()) {
          throw new PlansServiceError(
            "INVALID_REQUEST",
            "Choose a future time for this Together plan.",
          );
        }
        const existingSourcePlan = await tx.planRequest.findFirst({
          where: {
            originKind: "MUTUAL_OPPORTUNITY",
            originId: trustedMutualOrigin.id,
            status: { in: ["PENDING", "ACCEPTED"] },
          },
          select: { status: true },
          orderBy: { createdAt: "desc" },
        });
        if (existingSourcePlan?.status === "PENDING") {
          throw new PlansServiceError(
            "CONFLICT",
            "This Together opportunity already has a plan waiting for a response.",
          );
        }
        if (existingSourcePlan?.status === "ACCEPTED") {
          throw new PlansServiceError(
            "CONFLICT",
            "This Together opportunity has already been arranged.",
          );
        }
      }
      if (
        trustedActionOrigin?.classmatePost.coordinationPolicy ===
        "CREATOR_GATED_V2"
      ) {
        const context = trustedActionOrigin.coordinationContext;
        throw new PlansServiceError(
          "COORDINATION_POLICY_UNSUPPORTED",
          LEGACY_PLAN_POLICY_UNSUPPORTED_MESSAGE,
          context?.state === "OPEN" &&
            context.connectionId === options.connectionId
            ? {
                action: "OPEN_ACTION_CONTEXT",
                focus: {
                  type: "ACTION_CONTEXT",
                  connectionId: options.connectionId,
                  contextId: context.id,
                },
              }
            : null,
        );
      }
      const gate = await assertDirectUnrepliedSendAllowed(tx, {
        connectionId: options.connectionId,
        senderId: options.userId,
      });
      const mutualCommitment = trustedMutualOrigin
        ? await tx.planCommitment.create({
            data: {
              connectionId: connection.id,
              participantAId: connection.userAId,
              participantBId: connection.userBId,
              status: "NEGOTIATING",
            },
            select: { id: true },
          })
        : null;
      const planRequest = await tx.planRequest.create({
        data: {
          connectionId: options.connectionId,
          proposerUserId: options.userId,
          receiverUserId,
          planType: options.planType ?? "CUSTOM",
          title: options.title.trim(),
          location: options.location?.trim() || null,
          message: options.message?.trim() || null,
          startTime,
          endTime,
          actionInterestId: trustedActionOrigin?.id ?? null,
          commitmentId: mutualCommitment?.id ?? null,
          revisionKind: mutualCommitment ? "INITIAL" : null,
          originKind: trustedActionOrigin
            ? "ACTION_INTEREST"
            : trustedMutualOrigin
              ? "MUTUAL_OPPORTUNITY"
              : null,
          originId: trustedActionOrigin?.id ?? trustedMutualOrigin?.id ?? null,
          originSnapshot:
            trustedActionOrigin?.originSnapshot ??
            trustedMutualOrigin?.contextSnapshot ??
            undefined,
        },
        include: planRequestV1Include,
      });

      if (mutualCommitment) {
        await tx.planCommitment.update({
          where: { id: mutualCommitment.id },
          data: { currentPendingRevisionId: planRequest.id },
        });
      }

      const message = await tx.message.create({
        data: {
          connectionId: options.connectionId,
          senderId: options.userId,
          body: "",
          type: "PLAN_REQUEST_CARD",
          planRequestId: planRequest.id,
        },
      });

      await completeDirectReplyGateAfterSend(
        tx,
        options.connectionId,
        message.createdAt,
        gate,
      );

      await recordPlanEvent(tx, {
        actorId: options.userId,
        planRequestId: planRequest.id,
        connectionId: options.connectionId,
        name: "PLAN_PROPOSED",
        occurredAt: planRequest.createdAt,
      });

      return { planRequest, messageId: message.id };
    });
  } catch (cause) {
    if (cause instanceof PeerReplyRequiredError) {
      throw new PlansServiceError("PEER_REPLY_REQUIRED", cause.message);
    }
    if (cause instanceof LegacyPlanTransitionConflictError) {
      throw new PlansServiceError("NOT_FOUND", "Conversation not found.");
    }
    throw cause;
  }

  scheduleNewDirectChatMessageNotification({
    connectionId: options.connectionId,
    senderId: options.userId,
    bodyPreview: `Plan invite: ${result.planRequest.title}`,
    kind: "plan_invite",
    planId: result.planRequest.id,
    planTitle: result.planRequest.title,
  });

  return {
    plan: planRequestV1(result.planRequest, options.userId),
    messageId: result.messageId,
  };
}

export async function acceptPlanRequest(options: {
  userId: string;
  planId: string;
}) {
  // Ensure a stable Mutual proposal whose start already elapsed becomes
  // EXPIRED/CLOSED before we evaluate whether it can still be accepted.
  await finalizeStablePlanRevision(options.planId);

  const planRequest = await prisma.planRequest.findFirst({
    where: {
      id: options.planId,
      connection: {
        OR: [{ userAId: options.userId }, { userBId: options.userId }],
        status: "ACTIVE",
        userA: { moderationBlocks: { none: { isActive: true } } },
        userB: { moderationBlocks: { none: { isActive: true } } },
      },
      AND: [legacyParticipantVisibleWhere],
    },
    include: {
      ...planRequestV1Include,
      availabilityShare: true,
      scheduleShareLink: true,
    },
  });

  if (!planRequest) {
    throw new PlansServiceError("NOT_FOUND", "Plan request not found.");
  }
  if (planRequest.receiverUserId !== options.userId) {
    throw new PlansServiceError(
      "FORBIDDEN",
      "Only the receiver can accept this request.",
    );
  }
  if (planRequest.status !== "PENDING") {
    throw new PlansServiceError("CONFLICT", "This request is no longer pending.");
  }

  if (planRequest.scheduleShareLinkId && planRequest.scheduleShareLink) {
    const link = planRequest.scheduleShareLink;
    const reveal = parseRevealConfigJson(link.revealConfig);
    const fits = await rangeFitsScheduleShareSnapshot(prisma, {
      ownerUserId: link.ownerUserId,
      rangeStart: link.rangeStart,
      rangeEnd: link.rangeEnd,
      proposalStart: planRequest.startTime,
      proposalEnd: planRequest.endTime,
      includedDates: reveal.includedDates,
      availabilityStartMinutes: reveal.availabilityStartMinutes,
      availabilityEndMinutes: reveal.availabilityEndMinutes,
    });
    if (!fits) {
      throw new PlansServiceError("CONFLICT", PUBLIC_SCHEDULE_TIME_UNAVAILABLE);
    }
  } else if (planRequest.availabilityShareId && planRequest.availabilityShare) {
    if (!isAvailabilityShareActive(planRequest.availabilityShare)) {
      throw new PlansServiceError(
        "CONFLICT",
        "This time is no longer available. Please choose another slot.",
      );
    }
    const included = normalizeAvailabilityIncludedDates(
      planRequest.availabilityShare.includedDates,
    );
    const days = await prisma.$transaction((tx) =>
      getAvailabilityDaysForUser(
        tx,
        planRequest.receiverUserId,
        planRequest.availabilityShare!.rangeStart,
        planRequest.availabilityShare!.rangeEnd,
        included,
      ),
    );
    if (
      !rangeFitsAvailability(days, planRequest.startTime, planRequest.endTime)
    ) {
      throw new PlansServiceError(
        "CONFLICT",
        "This time is no longer available. Please choose another slot.",
      );
    }
  }

  let accepted;
  try {
    accepted = await prisma.$transaction(async (tx) => {
      let gate: Awaited<
        ReturnType<typeof assertDirectUnrepliedSendAllowed>
      > | null = null;
      const transition = await acceptLegacyPlanRevision(tx, planRequest.id, {
        afterConnectionSafety: async () => {
          gate = await assertDirectUnrepliedSendAllowed(tx, {
            connectionId: planRequest.connectionId,
            senderId: options.userId,
          });
        },
      });
      if (!gate) throw new LegacyPlanTransitionConflictError();
      const updated = await tx.planRequest.findUniqueOrThrow({
        where: { id: transition.revision.id },
        include: planRequestV1Include,
      });

      await materializePlanCalendarEntries(tx, {
        planRequestId: planRequest.id,
        planCommitmentId: transition.planCommitmentId,
        proposerUserId: planRequest.proposerUserId,
        proposerName: planRequest.proposer.nickname ?? planRequest.proposer.username,
        receiverUserId: planRequest.receiverUserId,
        receiverName: planRequest.receiver.nickname ?? planRequest.receiver.username,
        title: planRequest.title,
        planType: planRequest.planType,
        location: planRequest.location,
        note: planRequest.message,
        startTime: planRequest.startTime,
        endTime: planRequest.endTime,
      });

      await finalizeAcceptedMutualOpportunityPlan(tx, {
        connectionId: updated.connectionId,
        originKind: updated.originKind,
        originId: updated.originId,
        acceptedAt: updated.updatedAt,
      });

      await syncScheduleShareGuestProposalStatus(
        tx,
        planRequest.scheduleShareGuestProposalId,
        "ACCEPTED",
      );

      const confirmation = await tx.message.create({
        data: {
          connectionId: planRequest.connectionId,
          senderId: options.userId,
          body: "Plan confirmed",
          type: "PLAN_CONFIRMED_CARD",
          planRequestId: planRequest.id,
        },
      });

      await completeDirectReplyGateAfterSend(
        tx,
        planRequest.connectionId,
        confirmation.createdAt,
        gate,
      );

      await recordPlanEvent(tx, {
        actorId: options.userId,
        planRequestId: planRequest.id,
        connectionId: planRequest.connectionId,
        name: "PLAN_ACCEPTED",
        occurredAt: updated.updatedAt,
      });

      return updated;
    });
  } catch (cause) {
    if (cause instanceof LegacyPlanPolicyUnsupportedError) {
      throw new PlansServiceError(
        "COORDINATION_POLICY_UNSUPPORTED",
        cause.message,
        cause.recovery,
      );
    }
    if (cause instanceof LegacyPlanTransitionConflictError) {
      throw new PlansServiceError("CONFLICT", cause.message);
    }
    throw cause;
  }

  scheduleNewDirectChatMessageNotification({
    connectionId: planRequest.connectionId,
    senderId: options.userId,
    bodyPreview: `Plan confirmed: ${planRequest.title}`,
    kind: "plan_accepted",
    planId: planRequest.id,
    planTitle: planRequest.title,
  });

  return planRequestV1(accepted, options.userId);
}

export async function declinePlanRequest(options: {
  userId: string;
  planId: string;
}) {
  const planRequest = await prisma.planRequest.findFirst({
    where: {
      id: options.planId,
      connection: {
        OR: [{ userAId: options.userId }, { userBId: options.userId }],
        status: "ACTIVE",
        userA: { moderationBlocks: { none: { isActive: true } } },
        userB: { moderationBlocks: { none: { isActive: true } } },
      },
      AND: [legacyParticipantVisibleWhere],
    },
    include: planRequestV1Include,
  });
  if (!planRequest) {
    throw new PlansServiceError("NOT_FOUND", "Plan request not found.");
  }
  if (planRequest.receiverUserId !== options.userId) {
    throw new PlansServiceError(
      "FORBIDDEN",
      "Only the receiver can decline this request.",
    );
  }
  if (planRequest.status !== "PENDING") {
    throw new PlansServiceError("CONFLICT", "This request is no longer pending.");
  }

  let declined;
  try {
    declined = await prisma.$transaction(async (tx) => {
      const transition = await declineLegacyPlanRevision(tx, planRequest.id);
      const updated = await tx.planRequest.findUniqueOrThrow({
        where: { id: transition.revision.id },
        include: planRequestV1Include,
      });

      await syncScheduleShareGuestProposalStatus(
        tx,
        planRequest.scheduleShareGuestProposalId,
        "DECLINED",
      );

      await tx.message.create({
        data: {
          connectionId: planRequest.connectionId,
          senderId: options.userId,
          body: "Declined the plan request.",
          type: "SYSTEM",
          planRequestId: planRequest.id,
        },
      });

      await recordPlanEvent(tx, {
        actorId: options.userId,
        planRequestId: planRequest.id,
        connectionId: planRequest.connectionId,
        name: "PLAN_DECLINED",
        occurredAt: updated.updatedAt,
      });

      return updated;
    });
  } catch (cause) {
    if (cause instanceof LegacyPlanPolicyUnsupportedError) {
      throw new PlansServiceError(
        "COORDINATION_POLICY_UNSUPPORTED",
        cause.message,
        cause.recovery,
      );
    }
    if (cause instanceof LegacyPlanTransitionConflictError) {
      throw new PlansServiceError("CONFLICT", cause.message);
    }
    throw cause;
  }

  scheduleNewDirectChatMessageNotification({
    connectionId: planRequest.connectionId,
    senderId: options.userId,
    bodyPreview: `Plan declined: ${planRequest.title}`,
    kind: "plan_declined",
    planId: planRequest.id,
    planTitle: planRequest.title,
  });

  return planRequestV1(declined, options.userId);
}

export async function counterProposePlanRequest(options: {
  userId: string;
  planId: string;
  title: string;
  location?: string | null;
  message?: string | null;
  startTime: string;
  endTime: string;
  planType?: PlanType;
}) {
  const planRequest = await prisma.planRequest.findFirst({
    where: {
      id: options.planId,
      connection: {
        OR: [{ userAId: options.userId }, { userBId: options.userId }],
        status: "ACTIVE",
        userA: { moderationBlocks: { none: { isActive: true } } },
        userB: { moderationBlocks: { none: { isActive: true } } },
      },
      AND: [legacyParticipantVisibleWhere],
    },
  });
  if (!planRequest) {
    throw new PlansServiceError("NOT_FOUND", "Plan request not found.");
  }
  if (planRequest.receiverUserId !== options.userId) {
    throw new PlansServiceError(
      "FORBIDDEN",
      "Only the receiver can suggest another time.",
    );
  }
  if (planRequest.status !== "PENDING") {
    throw new PlansServiceError("CONFLICT", "This request is no longer pending.");
  }

  const startTime = new Date(options.startTime);
  const endTime = new Date(options.endTime);

  let counter;
  try {
    counter = await prisma.$transaction(async (tx) => {
      let gate: Awaited<
        ReturnType<typeof assertDirectUnrepliedSendAllowed>
      > | null = null;
      const created = await counterLegacyPlanRevision(tx, {
        planRequestId: planRequest.id,
        afterConnectionSafety: async () => {
          gate = await assertDirectUnrepliedSendAllowed(tx, {
            connectionId: planRequest.connectionId,
            senderId: options.userId,
          });
        },
        createCounter: (inheritance) =>
          tx.planRequest.create({
            data: {
              connectionId: planRequest.connectionId,
              availabilityShareId: null,
              counterOfId: planRequest.id,
              proposerUserId: options.userId,
              receiverUserId: planRequest.proposerUserId,
              planType: options.planType ?? "CUSTOM",
              title: options.title.trim(),
              location: options.location?.trim() || null,
              message: options.message?.trim() || null,
              startTime,
              endTime,
              actionInterestId: planRequest.actionInterestId,
              originKind: planRequest.originKind,
              originId: planRequest.originId,
              originSnapshot: planRequest.originSnapshot ?? undefined,
              ...(inheritance ?? {}),
            },
            include: planRequestV1Include,
          }),
      });
      if (!gate) throw new LegacyPlanTransitionConflictError();

      const message = await tx.message.create({
        data: {
          connectionId: planRequest.connectionId,
          senderId: options.userId,
          body: "",
          type: "PLAN_REQUEST_CARD",
          planRequestId: created.id,
        },
      });

      await completeDirectReplyGateAfterSend(
        tx,
        planRequest.connectionId,
        message.createdAt,
        gate,
      );

      await recordPlanEvent(tx, {
        actorId: options.userId,
        planRequestId: created.id,
        connectionId: planRequest.connectionId,
        name: "PLAN_COUNTERED",
        occurredAt: created.createdAt,
      });

      return created;
    });
  } catch (cause) {
    if (cause instanceof LegacyPlanPolicyUnsupportedError) {
      throw new PlansServiceError(
        "COORDINATION_POLICY_UNSUPPORTED",
        cause.message,
        cause.recovery,
      );
    }
    if (cause instanceof LegacyPlanTransitionConflictError) {
      throw new PlansServiceError("CONFLICT", cause.message);
    }
    throw cause;
  }

  scheduleNewDirectChatMessageNotification({
    connectionId: planRequest.connectionId,
    senderId: options.userId,
    bodyPreview: `New plan time: ${counter.title}`,
    kind: "plan_counter",
    planId: counter.id,
    planTitle: counter.title,
  });

  return planRequestV1(counter, options.userId);
}

export async function recordPlanOutcome(options: {
  userId: string;
  planId: string;
  value: "OCCURRED" | "DID_NOT_OCCUR" | "PREFER_NOT_TO_SAY";
}) {
  return prisma.$transaction(async (tx) => {
    const plan = await tx.planRequest.findFirst({
      where: {
        id: options.planId,
        status: "ACCEPTED",
        endTime: { lte: new Date() },
        OR: [{ proposerUserId: options.userId }, { receiverUserId: options.userId }],
        AND: [legacyParticipantVisibleWhere],
      },
      select: { id: true, connectionId: true, commitmentId: true },
    });
    if (!plan) {
      throw new PlansServiceError(
        "INVALID_REQUEST",
        "Outcome feedback is available after an accepted plan ends.",
      );
    }
    let response;
    try {
      response = await upsertLegacyPlanOutcome(tx, {
        planId: plan.id,
        userId: options.userId,
        value: options.value,
      });
    } catch (cause) {
      if (cause instanceof LegacyPlanTransitionConflictError) {
        throw new PlansServiceError("INVALID_REQUEST", cause.message);
      }
      throw cause;
    }
    await recordPlanEvent(tx, {
      actorId: options.userId,
      planRequestId: plan.id,
      connectionId: plan.connectionId,
      name: "OUTCOME_RECORDED",
      occurredAt: response.updatedAt,
    });
    return {
      planId: plan.id,
      value: response.value,
      updatedAt: response.updatedAt.toISOString(),
    };
  });
}

export function mapPlansError(cause: PlansServiceError): {
  code:
    | "NOT_FOUND"
    | "CONTENT_RESTRICTED"
    | "PEER_REPLY_REQUIRED"
    | "COORDINATION_POLICY_UNSUPPORTED"
    | "INVALID_REQUEST";
  status: number;
  message: string;
  recovery?: LegacyPlanPolicyRecovery;
} {
  if (cause.code === "NOT_FOUND") {
    return { code: "NOT_FOUND", status: 404, message: cause.messageText };
  }
  if (cause.code === "FORBIDDEN" || cause.code === "CONTENT_RESTRICTED") {
    return {
      code: "CONTENT_RESTRICTED",
      status: 403,
      message: cause.messageText,
    };
  }
  if (cause.code === "PEER_REPLY_REQUIRED") {
    return {
      code: "PEER_REPLY_REQUIRED",
      status: 403,
      message: cause.messageText,
    };
  }
  if (cause.code === "COORDINATION_POLICY_UNSUPPORTED") {
    return {
      code: "COORDINATION_POLICY_UNSUPPORTED",
      status: 409,
      message: cause.messageText,
      ...(cause.recovery ? { recovery: cause.recovery } : {}),
    };
  }
  if (cause.code === "CONFLICT") {
    return { code: "INVALID_REQUEST", status: 409, message: cause.messageText };
  }
  return { code: "INVALID_REQUEST", status: 422, message: cause.messageText };
}

export type PlanRequestDto = ReturnType<typeof planRequestV1>;
