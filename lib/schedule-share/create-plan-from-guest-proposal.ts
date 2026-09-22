import { PlanType, type PlanRequestStatus, type Prisma, type PrismaClient } from "@prisma/client";

import {
  ensureActiveConnectionForScheduleShare,
  type EnsureScheduleShareConnectionError,
} from "@/lib/schedule-share/ensure-connection-for-schedule-share";
import {
  serializeViewerProposal,
  type ViewerScheduleShareProposal,
} from "@/lib/schedule-share/viewer-proposal";

export type SubmitScheduleSharePlanError =
  | EnsureScheduleShareConnectionError
  | "already_accepted";

export type SubmitScheduleSharePlanInput = {
  scheduleShareLinkId: string;
  ownerUserId: string;
  proposerUserId: string;
  title: string;
  note: string | null;
  location: string | null;
  startTime: Date;
  endTime: Date;
  guestDisplayName: string;
  createdFromIp: string;
  userAgent: string;
};

export type SubmitScheduleSharePlanResult =
  | {
      ok: true;
      updated: boolean;
      connectionCreated: boolean;
      proposal: ViewerScheduleShareProposal;
    }
  | { ok: false; reason: SubmitScheduleSharePlanError };

type Tx = Prisma.TransactionClient;

class ScheduleShareAlreadyAcceptedRollback extends Error {
  constructor() {
    super("already_accepted");
    this.name = "ScheduleShareAlreadyAcceptedRollback";
  }
}

const planSelect = {
  id: true,
  title: true,
  message: true,
  location: true,
  startTime: true,
  endTime: true,
  status: true,
} as const;

function planToViewerProposal(row: {
  id: string;
  title: string;
  message: string | null;
  location: string | null;
  startTime: Date;
  endTime: Date;
  status: PlanRequestStatus;
}): ViewerScheduleShareProposal | null {
  if (row.status !== "PENDING" && row.status !== "ACCEPTED") {
    return null;
  }
  return {
    id: row.id,
    title: row.title,
    note: row.message,
    location: row.location,
    startTime: row.startTime.toISOString(),
    endTime: row.endTime.toISOString(),
    status: row.status,
  };
}

export async function submitScheduleSharePlanProposal(
  db: PrismaClient,
  input: SubmitScheduleSharePlanInput,
): Promise<SubmitScheduleSharePlanResult> {
  try {
    return await db.$transaction(async (tx) => {
      // ensureActiveConnection reuses this transaction, takes the canonical
      // pair lock and revalidates both users and safety barriers. The xact lock
      // remains held through the Plan and card writes below.
      const connectionResult = await ensureActiveConnectionForScheduleShare(
        tx,
        input.proposerUserId,
        input.ownerUserId,
      );
      if (!connectionResult.ok) {
        return { ok: false, reason: connectionResult.reason } as const;
      }

      const [acceptedPlan, acceptedGuest] = await Promise.all([
        tx.planRequest.findFirst({
          where: {
            scheduleShareLinkId: input.scheduleShareLinkId,
            proposerUserId: input.proposerUserId,
            status: "ACCEPTED",
          },
          select: { id: true },
        }),
        tx.scheduleShareGuestProposal.findFirst({
          where: {
            scheduleShareLinkId: input.scheduleShareLinkId,
            proposerUserId: input.proposerUserId,
            status: "ACCEPTED",
          },
          select: { id: true },
        }),
      ]);
      if (acceptedPlan || acceptedGuest) {
        // Throwing is intentional: if ensureActiveConnection created a row in
        // this transaction, an already-accepted result must roll it back.
        throw new ScheduleShareAlreadyAcceptedRollback();
      }

      const outcome = await upsertScheduleSharePlanInTx(tx, {
        ...input,
        connectionId: connectionResult.connectionId,
      });
      if (!outcome.ok) {
        throw new ScheduleShareAlreadyAcceptedRollback();
      }

      return {
        ok: true,
        updated: outcome.updated,
        connectionCreated: connectionResult.created,
        proposal: outcome.proposal,
      } as const;
    });
  } catch (cause) {
    if (cause instanceof ScheduleShareAlreadyAcceptedRollback) {
      return { ok: false, reason: "already_accepted" };
    }
    throw cause;
  }
}

async function upsertScheduleSharePlanInTx(
  tx: Tx,
  input: SubmitScheduleSharePlanInput & { connectionId: string },
): Promise<
  | { ok: true; updated: boolean; proposal: ViewerScheduleShareProposal }
  | { ok: false; reason: "already_accepted" }
> {
  let pendingPlan = await tx.planRequest.findFirst({
    where: {
      scheduleShareLinkId: input.scheduleShareLinkId,
      proposerUserId: input.proposerUserId,
      status: "PENDING",
    },
    select: { id: true, scheduleShareGuestProposalId: true },
  });

  if (!pendingPlan) {
    const legacyGuest = await tx.scheduleShareGuestProposal.findFirst({
      where: {
        scheduleShareLinkId: input.scheduleShareLinkId,
        proposerUserId: input.proposerUserId,
        status: "PENDING",
      },
      select: { id: true },
    });
    if (legacyGuest) {
      pendingPlan = await tx.planRequest.create({
        data: {
          connectionId: input.connectionId,
          scheduleShareLinkId: input.scheduleShareLinkId,
          scheduleShareGuestProposalId: legacyGuest.id,
          proposerUserId: input.proposerUserId,
          receiverUserId: input.ownerUserId,
          planType: PlanType.CUSTOM,
          title: input.title,
          message: input.note,
          location: input.location,
          startTime: input.startTime,
          endTime: input.endTime,
        },
        select: { id: true, scheduleShareGuestProposalId: true },
      });
      await tx.message.create({
        data: {
          connectionId: input.connectionId,
          senderId: input.proposerUserId,
          body: "",
          type: "PLAN_REQUEST_CARD",
          planRequestId: pendingPlan.id,
        },
      });
    }
  }

  const planFields = {
    title: input.title,
    message: input.note,
    location: input.location,
    startTime: input.startTime,
    endTime: input.endTime,
  };

  const guestFields = {
    proposerUserId: input.proposerUserId,
    guestDisplayName: input.guestDisplayName,
    guestContact: null as string | null,
    title: input.title,
    note: input.note,
    location: input.location,
    startTime: input.startTime,
    endTime: input.endTime,
    createdFromIp: input.createdFromIp,
    userAgent: input.userAgent.slice(0, 512),
  };

  if (pendingPlan) {
    const updatedPlan = await tx.planRequest.update({
      where: { id: pendingPlan.id },
      data: planFields,
      select: planSelect,
    });

    const guestId = pendingPlan.scheduleShareGuestProposalId;
    if (guestId) {
      await tx.scheduleShareGuestProposal.update({
        where: { id: guestId },
        data: guestFields,
      });
    } else {
      const guest = await tx.scheduleShareGuestProposal.create({
        data: {
          scheduleShareLinkId: input.scheduleShareLinkId,
          ...guestFields,
        },
        select: { id: true },
      });
      await tx.planRequest.update({
        where: { id: pendingPlan.id },
        data: { scheduleShareGuestProposalId: guest.id },
      });
    }

    const proposal = planToViewerProposal(updatedPlan);
    if (!proposal) {
      throw new Error("Unexpected plan status after update");
    }
    return { ok: true, updated: true, proposal };
  }

  const guest = await tx.scheduleShareGuestProposal.create({
    data: {
      scheduleShareLinkId: input.scheduleShareLinkId,
      ...guestFields,
    },
    select: { id: true },
  });

  const plan = await tx.planRequest.create({
    data: {
      connectionId: input.connectionId,
      scheduleShareLinkId: input.scheduleShareLinkId,
      scheduleShareGuestProposalId: guest.id,
      proposerUserId: input.proposerUserId,
      receiverUserId: input.ownerUserId,
      planType: PlanType.CUSTOM,
      ...planFields,
    },
    select: planSelect,
  });

  await tx.message.create({
    data: {
      connectionId: input.connectionId,
      senderId: input.proposerUserId,
      body: "",
      type: "PLAN_REQUEST_CARD",
      planRequestId: plan.id,
    },
  });

  await tx.connection.update({
    where: { id: input.connectionId },
    data: { updatedAt: new Date() },
  });

  const proposal = planToViewerProposal(plan);
  if (!proposal) {
    throw new Error("Unexpected plan status after create");
  }
  return { ok: true, updated: false, proposal };
}

/** Sync legacy guest proposal row when a schedule-share plan is accepted or declined. */
export async function syncScheduleShareGuestProposalStatus(
  tx: Tx,
  scheduleShareGuestProposalId: string | null,
  status: "ACCEPTED" | "DECLINED",
): Promise<void> {
  if (!scheduleShareGuestProposalId) return;

  await tx.scheduleShareGuestProposal.updateMany({
    where: {
      id: scheduleShareGuestProposalId,
      status: "PENDING",
    },
    data: { status },
  });
}

export function loadViewerProposalFromPlan(row: {
  id: string;
  title: string;
  message: string | null;
  location: string | null;
  startTime: Date;
  endTime: Date;
  status: PlanRequestStatus;
}): ViewerScheduleShareProposal | null {
  return serializeViewerProposal({
    id: row.id,
    title: row.title,
    note: row.message,
    location: row.location,
    startTime: row.startTime,
    endTime: row.endTime,
    status: row.status === "ACCEPTED" ? "ACCEPTED" : row.status === "PENDING" ? "PENDING" : "DECLINED",
  });
}
