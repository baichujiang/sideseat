import { prisma } from "@/lib/db/prisma";
import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { error, ok } from "@/lib/http";
import { PUBLIC_SCHEDULE_TIME_UNAVAILABLE } from "@/lib/schedule-share/public-errors";
import { rangeFitsScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { scheduleShareProposerDisplayName } from "@/lib/schedule-share/proposer-display-name";

type TxOutcome =
  | { ok: true }
  | { ok: false; reason: "not_found" | "conflict" | "time" | "missing_proposer" };

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const auth = await resolveOnboardedUserForApi();
  if (!auth.ok) return error(auth.error, auth.status);

  const { proposalId } = await params;

  const outcome = await prisma.$transaction(async (tx): Promise<TxOutcome> => {
    const proposal = await tx.scheduleShareGuestProposal.findUnique({
      where: { id: proposalId },
      include: {
        scheduleShareLink: true,
        proposerUser: { select: { id: true, nickname: true, username: true } },
      },
    });

    if (!proposal || proposal.scheduleShareLink.ownerUserId !== auth.user.id) {
      return { ok: false, reason: "not_found" };
    }
    if (proposal.status !== "PENDING") {
      return { ok: false, reason: "conflict" };
    }

    const fits = await rangeFitsScheduleShareSnapshot(tx, {
      ownerUserId: proposal.scheduleShareLink.ownerUserId,
      rangeStart: proposal.scheduleShareLink.rangeStart,
      rangeEnd: proposal.scheduleShareLink.rangeEnd,
      proposalStart: proposal.startTime,
      proposalEnd: proposal.endTime,
    });

    if (!fits) {
      return { ok: false, reason: "time" };
    }

    if (!proposal.proposerUserId) {
      return { ok: false, reason: "missing_proposer" };
    }

    const entry = await tx.calendarEntry.create({
      data: {
        userId: proposal.scheduleShareLink.ownerUserId,
        title: proposal.title,
        startAt: proposal.startTime,
        endAt: proposal.endTime,
        location: proposal.location,
        note: proposal.note,
        source: "schedule_share_proposal",
      },
    });

    const proposerDisplayName = scheduleShareProposerDisplayName(
      proposal.proposerUser,
      proposal.guestDisplayName,
    );

    await tx.calendarEntryCompanion.upsert({
      where: { id: `${entry.id}:${proposal.proposerUserId}` },
      create: {
        id: `${entry.id}:${proposal.proposerUserId}`,
        calendarEntryId: entry.id,
        userId: proposal.proposerUserId,
        displayName: proposerDisplayName,
      },
      update: {
        displayName: proposerDisplayName,
      },
    });

    const updated = await tx.scheduleShareGuestProposal.updateMany({
      where: { id: proposal.id, status: "PENDING" },
      data: {
        status: "ACCEPTED",
        acceptedCalendarEntryId: entry.id,
      },
    });

    if (updated.count !== 1) {
      return { ok: false, reason: "conflict" };
    }

    return { ok: true };
  });

  if (!outcome.ok) {
    if (outcome.reason === "not_found") return error("Proposal not found.", 404);
    if (outcome.reason === "time") return error(PUBLIC_SCHEDULE_TIME_UNAVAILABLE, 409);
    if (outcome.reason === "missing_proposer") {
      return error("This proposal has no linked account and cannot be accepted.", 409);
    }
    return error("This proposal can no longer be accepted.", 409);
  }

  return ok({ accepted: true });
}
