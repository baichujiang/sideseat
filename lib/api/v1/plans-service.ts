import "server-only";

import { ConnectionStatus, type PlanType } from "@prisma/client";

import { planRequestV1, planRequestV1Include } from "@/lib/api/v1/plans-dto";
import {
  assertDirectUnrepliedSendAllowed,
  completeDirectReplyGateAfterSend,
  PeerReplyRequiredError,
} from "@/lib/chat/direct-message-service";
import { prisma } from "@/lib/db/prisma";
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

export class PlansServiceError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "FORBIDDEN"
      | "INVALID_REQUEST"
      | "CONFLICT"
      | "CONTENT_RESTRICTED"
      | "PEER_REPLY_REQUIRED",
    readonly messageText: string,
  ) {
    super(messageText);
    this.name = "PlansServiceError";
  }
}

export async function listPlansForUser(userId: string) {
  const now = new Date();
  const rows = await prisma.planRequest.findMany({
    where: {
      connection: {
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      AND: [
        { OR: [{ proposerUserId: userId }, { receiverUserId: userId }] },
        {
          OR: [
            { status: "PENDING" },
            { status: "ACCEPTED", endTime: { gt: now } },
          ],
        },
      ],
    },
    include: planRequestV1Include,
    orderBy: { startTime: "asc" },
    take: 100,
  });
  return rows.map(planRequestV1);
}

export async function getPlanRequest(options: {
  userId: string;
  planId: string;
}) {
  const plan = await prisma.planRequest.findFirst({
    where: {
      id: options.planId,
      connection: {
        OR: [{ userAId: options.userId }, { userBId: options.userId }],
      },
    },
    include: planRequestV1Include,
  });
  if (!plan) {
    throw new PlansServiceError("NOT_FOUND", "Plan request not found.");
  }
  return planRequestV1(plan);
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
}) {
  const startTime = new Date(options.startTime);
  const endTime = new Date(options.endTime);

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const gate = await assertDirectUnrepliedSendAllowed(tx, {
        connectionId: options.connectionId,
        senderId: options.userId,
      });
      const connection = await tx.connection.findFirst({
        where: {
          id: options.connectionId,
          status: ConnectionStatus.ACTIVE,
          OR: [{ userAId: options.userId }, { userBId: options.userId }],
        },
        select: { id: true, userAId: true, userBId: true },
      });
      if (!connection) {
        throw new PlansServiceError("NOT_FOUND", "Conversation not found.");
      }

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
        },
        include: planRequestV1Include,
      });

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

      return { planRequest, messageId: message.id };
    });
  } catch (cause) {
    if (cause instanceof PeerReplyRequiredError) {
      throw new PlansServiceError("PEER_REPLY_REQUIRED", cause.message);
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
    plan: planRequestV1(result.planRequest),
    messageId: result.messageId,
  };
}

export async function acceptPlanRequest(options: {
  userId: string;
  planId: string;
}) {
  const planRequest = await prisma.planRequest.findFirst({
    where: {
      id: options.planId,
      connection: {
        OR: [{ userAId: options.userId }, { userBId: options.userId }],
        status: "ACTIVE",
      },
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
    const fits = await rangeFitsScheduleShareSnapshot(prisma, {
      ownerUserId: link.ownerUserId,
      rangeStart: link.rangeStart,
      rangeEnd: link.rangeEnd,
      proposalStart: planRequest.startTime,
      proposalEnd: planRequest.endTime,
      includedDates: parseRevealConfigJson(link.revealConfig).includedDates,
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

  const accepted = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "PlanRequest" WHERE id = ${planRequest.id} FOR UPDATE`;
    const current = await tx.planRequest.findUnique({
      where: { id: planRequest.id },
      select: { status: true },
    });
    if (current?.status !== "PENDING") {
      throw new PlansServiceError("CONFLICT", "This request is no longer pending.");
    }

    const gate = await assertDirectUnrepliedSendAllowed(tx, {
      connectionId: planRequest.connectionId,
      senderId: options.userId,
    });
    const updated = await tx.planRequest.update({
      where: { id: planRequest.id },
      data: { status: "ACCEPTED" },
      include: planRequestV1Include,
    });

    await materializePlanCalendarEntries(tx, {
      planRequestId: planRequest.id,
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

    return updated;
  });

  scheduleNewDirectChatMessageNotification({
    connectionId: planRequest.connectionId,
    senderId: options.userId,
    bodyPreview: `Plan confirmed: ${planRequest.title}`,
    kind: "plan_accepted",
    planId: planRequest.id,
    planTitle: planRequest.title,
  });

  return planRequestV1(accepted);
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
      },
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

  const declined = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "PlanRequest" WHERE id = ${planRequest.id} FOR UPDATE`;
    const current = await tx.planRequest.findUnique({
      where: { id: planRequest.id },
      select: { status: true },
    });
    if (current?.status !== "PENDING") {
      throw new PlansServiceError("CONFLICT", "This request is no longer pending.");
    }

    const updated = await tx.planRequest.update({
      where: { id: planRequest.id },
      data: { status: "DECLINED" },
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

    return updated;
  });

  scheduleNewDirectChatMessageNotification({
    connectionId: planRequest.connectionId,
    senderId: options.userId,
    bodyPreview: `Plan declined: ${planRequest.title}`,
    kind: "plan_declined",
    planId: planRequest.id,
    planTitle: planRequest.title,
  });

  return planRequestV1(declined);
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
      },
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

  const counter = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT id FROM "PlanRequest" WHERE id = ${planRequest.id} FOR UPDATE`;
    const current = await tx.planRequest.findUnique({
      where: { id: planRequest.id },
      select: { status: true },
    });
    if (current?.status !== "PENDING") {
      throw new PlansServiceError("CONFLICT", "This request is no longer pending.");
    }

    const gate = await assertDirectUnrepliedSendAllowed(tx, {
      connectionId: planRequest.connectionId,
      senderId: options.userId,
    });
    await tx.planRequest.update({
      where: { id: planRequest.id },
      data: { status: "COUNTER_PROPOSED" },
    });

    const created = await tx.planRequest.create({
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
      },
      include: planRequestV1Include,
    });

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

    return created;
  });

  scheduleNewDirectChatMessageNotification({
    connectionId: planRequest.connectionId,
    senderId: options.userId,
    bodyPreview: `New plan time: ${counter.title}`,
    kind: "plan_counter",
    planId: counter.id,
    planTitle: counter.title,
  });

  return planRequestV1(counter);
}

export function mapPlansError(cause: PlansServiceError): {
  code:
    | "NOT_FOUND"
    | "CONTENT_RESTRICTED"
    | "PEER_REPLY_REQUIRED"
    | "INVALID_REQUEST";
  status: number;
  message: string;
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
  if (cause.code === "CONFLICT") {
    return { code: "INVALID_REQUEST", status: 409, message: cause.messageText };
  }
  return { code: "INVALID_REQUEST", status: 422, message: cause.messageText };
}

export type PlanRequestDto = ReturnType<typeof planRequestV1>;
