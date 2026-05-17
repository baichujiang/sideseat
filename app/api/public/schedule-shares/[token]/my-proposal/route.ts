import { NextResponse } from "next/server";

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { loadViewerProposalFromPlan } from "@/lib/schedule-share/create-plan-from-guest-proposal";
import { PUBLIC_SCHEDULE_LINK_UNAVAILABLE } from "@/lib/schedule-share/public-errors";
import { findScheduleShareLinkByPlainToken } from "@/lib/schedule-share/resolve-link";
import { serializeViewerProposal } from "@/lib/schedule-share/viewer-proposal";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getSessionUser();
  if (!session?.onboardingComplete) {
    return NextResponse.json({ success: true, data: { proposal: null } });
  }

  const { token } = await params;
  const decoded = decodeURIComponent(token);

  const resolved = await findScheduleShareLinkByPlainToken(prisma, decoded, {
    viewerUserId: session.id,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: PUBLIC_SCHEDULE_LINK_UNAVAILABLE },
      { status: 404 },
    );
  }

  const plan = await prisma.planRequest.findFirst({
    where: {
      scheduleShareLinkId: resolved.link.id,
      proposerUserId: session.id,
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
    return NextResponse.json({
      success: true,
      data: { proposal: loadViewerProposalFromPlan(plan) },
    });
  }

  const legacy = await prisma.scheduleShareGuestProposal.findFirst({
    where: {
      scheduleShareLinkId: resolved.link.id,
      proposerUserId: session.id,
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

  return NextResponse.json({
    success: true,
    data: { proposal: legacy ? serializeViewerProposal(legacy) : null },
  });
}
