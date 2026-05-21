import type { PrismaClient } from "@prisma/client";

import { loadViewerProposalFromPlan } from "@/lib/schedule-share/create-plan-from-guest-proposal";
import { serializeViewerProposal, type ViewerScheduleShareProposal } from "@/lib/schedule-share/viewer-proposal";

type Db = Pick<PrismaClient, "planRequest" | "scheduleShareGuestProposal">;

export async function loadInitialViewerProposalForShareLink(
  db: Db,
  scheduleShareLinkId: string,
  proposerUserId: string,
): Promise<ViewerScheduleShareProposal | null> {
  const plan = await db.planRequest.findFirst({
    where: {
      scheduleShareLinkId,
      proposerUserId,
      status: { in: ["PENDING", "ACCEPTED"] },
    },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      title: true,
      message: true,
      location: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  });

  if (plan) {
    return loadViewerProposalFromPlan(plan);
  }

  const legacy = await db.scheduleShareGuestProposal.findFirst({
    where: {
      scheduleShareLinkId,
      proposerUserId,
      status: { in: ["PENDING", "ACCEPTED"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      note: true,
      location: true,
      startTime: true,
      endTime: true,
      status: true,
    },
  });

  return legacy ? serializeViewerProposal(legacy) : null;
}
