import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { planRequestV1, planRequestV1Include } from "@/lib/api/v1/plans-dto";
import { PlansServiceError } from "@/lib/api/v1/plans-service";
import { lockLegacyPlanConnectionSafety } from "@/lib/plans/legacy-plan-commitment-compat";
import type { UserPushPayload } from "@/lib/push/apns-payload";

export const planCancellationSchema = z.object({
  reasonCode: z.enum(["SCHEDULE_CHANGED", "UNWELL", "SAFETY", "OTHER"]).nullable().optional(),
  note: z.string().trim().max(240).nullable().optional(),
}).strict();
export type PlanCancellationInput = z.infer<typeof planCancellationSchema>;
const visiblePlan = {
  connection: { status: "ACTIVE" as const,
    userA: { moderationBlocks: { none: { isActive: true } } },
    userB: { moderationBlocks: { none: { isActive: true } } } },
  OR: [{ commitmentId: null }, { commitment: { is: { safetyRestrictedAt: null } } }],
};
const noticeInclude = { actor: { select: { nickname: true, username: true } },
  plan: { include: planRequestV1Include } } as const;
type Notice = Prisma.PlanCancellationNoticeGetPayload<{ include: typeof noticeInclude }>;
function noticeDTO(notice: Notice, userId: string) {
  return { id: notice.id, actorName: notice.actor.nickname || notice.actor.username,
    wasConfirmed: notice.wasConfirmed, isLate: notice.isLate, reasonCode: notice.reasonCode,
    note: notice.note, createdAt: notice.createdAt.toISOString(), plan: planRequestV1(notice.plan, userId) };
}
export function cancellationPush(notice: { id: string; planId: string; wasConfirmed: boolean; plan: { connectionId: string } }): UserPushPayload {
  return { title: "SideSeat", body: notice.wasConfirmed ? "A plan was canceled. Open SideSeat to view the details." : "A plan proposal was withdrawn. Open SideSeat to view the details.",
    url: `/connections/${notice.plan.connectionId}`,
    threadId: `connection:${notice.plan.connectionId}`,
    data: { kind: "plan_canceled", connectionId: notice.plan.connectionId, cancellationId: notice.id } };
}

export async function cancelPlan(userId: string, planId: string, rawInput: PlanCancellationInput, now = new Date()) {
  const input = planCancellationSchema.parse(rawInput);
  return prisma.$transaction(async tx => {
    const snapshot = await tx.planRequest.findFirst({ where: { id: planId,
      OR: [{ proposerUserId: userId }, { receiverUserId: userId }] } });
    if (!snapshot) throw new PlansServiceError("NOT_FOUND", "Plan not found.");
    await lockLegacyPlanConnectionSafety(tx, { connectionId: snapshot.connectionId, actorId: userId });
    if (snapshot.commitmentId) await tx.$queryRaw`SELECT "id" FROM "PlanCommitment" WHERE "id" = ${snapshot.commitmentId} FOR UPDATE`;
    await tx.$queryRaw`SELECT "id" FROM "PlanRequest" WHERE "id" = ${planId} FOR UPDATE`;
    const plan = await tx.planRequest.findUniqueOrThrow({ where: { id: planId }, include: { commitment: true, cancellationNotice: true } });
    if (plan.commitment?.safetyRestrictedAt) throw new PlansServiceError("NOT_FOUND", "Plan unavailable.");
    if (plan.cancellationNotice) {
      if (plan.cancellationNotice.actorId !== userId) throw new PlansServiceError("CONFLICT", "This plan was already canceled.");
      return { notice: await tx.planCancellationNotice.findUniqueOrThrow({ where: { planId }, include: noticeInclude }), created: false };
    }
    const confirmed = plan.status === "ACCEPTED";
    if ((!confirmed && plan.status !== "PENDING") || plan.endTime <= now ||
        (!confirmed && plan.proposerUserId !== userId) ||
        (plan.commitment && (confirmed
          ? plan.commitment.status !== "CONFIRMED" || plan.commitment.currentAcceptedRevisionId !== plan.id
          : !["NEGOTIATING", "CONFIRMED"].includes(plan.commitment.status) || plan.commitment.currentPendingRevisionId !== plan.id))) {
      throw new PlansServiceError("CONFLICT", "This plan is no longer available to cancel. Reload it first.");
    }
    const isLate = confirmed && plan.startTime.getTime() - now.getTime() < 2 * 3600000;
    if (isLate && !input.reasonCode) throw new PlansServiceError("INVALID_REQUEST", "Choose a reason when canceling close to the start time.");
    if (confirmed && plan.commitmentId) {
      await tx.planRequest.updateMany({ where: { commitmentId: plan.commitmentId, status: "PENDING" },
        data: { status: "INVALIDATED", resolutionReason: "COMMITMENT_CANCELED", resolvedAt: now, resolvedByUserId: userId } });
      await tx.planCommitment.update({ where: { id: plan.commitmentId }, data: {
        status: "CANCELED", currentPendingRevisionId: null, canceledAt: now,
        canceledByUserId: userId, cancellationReason: "USER_CANCELED" } });
      // Accepted revisions are immutable historical facts; the commitment and DTO carry cancellation.
    } else {
      await tx.planRequest.update({ where: { id: planId }, data: { status: "CANCELED",
        resolutionReason: confirmed ? "COMMITMENT_CANCELED" : "PROPOSER_WITHDREW", resolvedAt: now, resolvedByUserId: userId } });
      if (plan.commitmentId) await tx.planCommitment.update({ where: { id: plan.commitmentId }, data: {
        currentPendingRevisionId: null, ...(plan.commitment!.status === "NEGOTIATING" ? { status: "CLOSED" } : {}) } });
    }
    if (confirmed) await tx.calendarEntry.updateMany({ where: plan.commitmentId
      ? { planCommitmentId: plan.commitmentId, projectionStatus: "ACTIVE" }
      : { planRequestId: planId, projectionStatus: "ACTIVE" }, data: { projectionStatus: "CANCELED" } });
    if (plan.scheduleShareGuestProposalId) await tx.scheduleShareGuestProposal.update({
      where: { id: plan.scheduleShareGuestProposalId }, data: { status: "DECLINED" } });
    const notice = await tx.planCancellationNotice.create({ data: { planId, actorId: userId,
      recipientId: plan.proposerUserId === userId ? plan.receiverUserId : plan.proposerUserId,
      wasConfirmed: confirmed, isLate, reasonCode: input.reasonCode, note: input.note || null, createdAt: now }, include: noticeInclude });
    await tx.message.create({ data: { connectionId: plan.connectionId, senderId: userId,
      type: "PLAN_REQUEST_CARD", planRequestId: plan.id, body: "", createdAt: now } });
    return { notice, created: true };
  });
}

export async function unreadPlanCancellations(userId: string) {
  const blocks = await prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
  const excluded = blocks.map(b => b.blockerId === userId ? b.blockedId : b.blockerId);
  const rows = await prisma.planCancellationNotice.findMany({
    where: { recipientId: userId, actorId: { notIn: excluded }, readAt: null, plan: visiblePlan },
    include: noticeInclude, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 20 });
  return rows.map(row => noticeDTO(row, userId));
}
export async function acknowledgePlanCancellation(userId: string, id: string) {
  const updated = await prisma.planCancellationNotice.updateMany({ where: { id, recipientId: userId, plan: visiblePlan }, data: { readAt: new Date() } });
  if (!updated.count) throw new PlansServiceError("NOT_FOUND", "Notification not found.");
  return { acknowledged: true };
}
