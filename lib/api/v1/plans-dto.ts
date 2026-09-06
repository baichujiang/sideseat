import type {
  ActionCoordinationPolicy,
  PlanRequest,
  PlanRequestStatus,
  PlanType,
  User,
} from "@prisma/client";

type PlanAuthor = Pick<User, "id" | "username" | "nickname" | "avatarUrl">;

export type PlanRequestV1Row = PlanRequest & {
  proposer: PlanAuthor;
  receiver: PlanAuthor;
  originAction: { coordinationPolicy: ActionCoordinationPolicy | null } | null;
  actionInterest: {
    classmatePost: { coordinationPolicy: ActionCoordinationPolicy | null };
  } | null;
  outcomeResponses: Array<{ userId: string; value: PlanRequestV1Outcome }>;
};

type PlanRequestV1Outcome = "OCCURRED" | "DID_NOT_OCCUR" | "PREFER_NOT_TO_SAY";

function author(user: PlanAuthor) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  };
}

export function planRequestV1(plan: PlanRequestV1Row, viewerId?: string) {
  const viewerOutcome = viewerId
    ? plan.outcomeResponses.find((row) => row.userId === viewerId)?.value ?? null
    : null;
  return {
    id: plan.id,
    connectionId: plan.connectionId,
    commitmentId: plan.commitmentId,
    originContextId: plan.originContextId,
    // Policy is sourced from the trusted Action relation. Stable IDs only
    // describe Plan ownership and must never be used to guess which API owns it.
    coordinationPolicy:
      plan.originAction?.coordinationPolicy ??
      plan.actionInterest?.classmatePost.coordinationPolicy ??
      null,
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
    origin:
      plan.originKind && plan.originId && plan.originSnapshot
        ? {
            kind: plan.originKind,
            id: plan.originId,
            snapshot: plan.originSnapshot,
          }
        : null,
    viewerOutcome,
    outcomeResponseCount: plan.outcomeResponses.length,
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
  originAction: {
    select: { coordinationPolicy: true },
  },
  actionInterest: {
    select: {
      classmatePost: { select: { coordinationPolicy: true } },
    },
  },
  outcomeResponses: {
    select: { userId: true, value: true },
  },
} as const;
