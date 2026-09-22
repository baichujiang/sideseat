import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";
import {
  acceptLegacyPlanRevision,
  LegacyPlanPolicyUnsupportedError,
  LegacyPlanTransitionConflictError,
} from "@/lib/plans/legacy-plan-commitment-compat";
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

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ requestId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { requestId } = await params;

    const planRequest = await prisma.planRequest.findFirst({
      where: {
        id: requestId,
        connection: {
          OR: [{ userAId: user.id }, { userBId: user.id }],
          status: "ACTIVE",
          userA: { moderationBlocks: { none: { isActive: true } } },
          userB: { moderationBlocks: { none: { isActive: true } } },
        },
        AND: [
          {
            OR: [
              { commitmentId: null },
              { commitment: { is: { safetyRestrictedAt: null } } },
            ],
          },
        ],
      },
      include: {
        availabilityShare: true,
        scheduleShareLink: true,
        proposer: {
          select: { id: true, nickname: true, username: true },
        },
        receiver: {
          select: { id: true, nickname: true, username: true },
        },
      },
    });

    if (!planRequest) {
      return error("Plan request not found.", 404);
    }
    if (planRequest.receiverUserId !== user.id) {
      return error("Only the receiver can accept this request.", 403);
    }
    if (planRequest.status !== "PENDING") {
      return error("This request is no longer pending.", 409);
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
        return error(PUBLIC_SCHEDULE_TIME_UNAVAILABLE, 409);
      }
    } else if (planRequest.availabilityShareId && planRequest.availabilityShare) {
      if (!isAvailabilityShareActive(planRequest.availabilityShare)) {
        return error("This time is no longer available. Please choose another slot.", 409);
      }
      const included = normalizeAvailabilityIncludedDates(
        planRequest.availabilityShare!.includedDates,
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
        !rangeFitsAvailability(
          days,
          planRequest.startTime,
          planRequest.endTime,
        )
      ) {
        return error("This time is no longer available. Please choose another slot.", 409);
      }
    }

    const result = await prisma.$transaction(async (tx) => {
      const transition = await acceptLegacyPlanRevision(tx, planRequest.id);

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

      await syncScheduleShareGuestProposalStatus(
        tx,
        planRequest.scheduleShareGuestProposalId,
        "ACCEPTED",
      );

      const confirmation = await tx.message.create({
        data: {
          connectionId: planRequest.connectionId,
          senderId: user.id,
          body: "Plan confirmed",
          type: "PLAN_CONFIRMED_CARD",
          planRequestId: planRequest.id,
        },
      });

      return { accepted: transition.revision, confirmation };
    });

    return ok(result);
  } catch (cause) {
    if (cause instanceof LegacyPlanPolicyUnsupportedError) {
      return error(cause.message, 409, cause.code);
    }
    if (cause instanceof LegacyPlanTransitionConflictError) {
      return error(cause.message, 409);
    }
    console.error(cause);
    return error("Unable to accept plan request.");
  }
}
