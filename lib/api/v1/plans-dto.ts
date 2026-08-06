import type { PlanRequest, PlanRequestStatus, PlanType, User } from "@prisma/client";

type PlanAuthor = Pick<User, "id" | "username" | "nickname" | "avatarUrl">;

export type PlanRequestV1Row = PlanRequest & {
  proposer: PlanAuthor;
  receiver: PlanAuthor;
};

function author(user: PlanAuthor) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  };
}

export function planRequestV1(plan: PlanRequestV1Row) {
  return {
    id: plan.id,
    connectionId: plan.connectionId,
    status: plan.status as PlanRequestStatus,
    planType: plan.planType as PlanType,
    title: plan.title,
    location: plan.location,
    message: plan.message,
    startTime: plan.startTime.toISOString(),
    endTime: plan.endTime.toISOString(),
    proposer: author(plan.proposer),
    receiver: author(plan.receiver),
    counterOfId: plan.counterOfId,
    availabilityShareId: plan.availabilityShareId,
    scheduleShareLinkId: plan.scheduleShareLinkId,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: plan.updatedAt.toISOString(),
  };
}

export const planRequestV1Include = {
  proposer: {
    select: { id: true, username: true, nickname: true, avatarUrl: true },
  },
  receiver: {
    select: { id: true, username: true, nickname: true, avatarUrl: true },
  },
} as const;
