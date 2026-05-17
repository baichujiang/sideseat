import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { parseBody, error } from "@/lib/http";
import {
  PUBLIC_SCHEDULE_LINK_UNAVAILABLE,
  PUBLIC_SCHEDULE_PROPOSAL_ALREADY_ACCEPTED,
  PUBLIC_SCHEDULE_RATE_LIMIT,
  PUBLIC_SCHEDULE_SIGN_IN_REQUIRED,
  PUBLIC_SCHEDULE_TIME_UNAVAILABLE,
} from "@/lib/schedule-share/public-errors";
import { assertScheduleShareProposalRateLimit, getClientIp, maybeHashIp } from "@/lib/schedule-share/rate-limit";
import { findScheduleShareLinkByPlainToken } from "@/lib/schedule-share/resolve-link";
import { rangeFitsScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { createScheduleShareProposalSchema } from "@/lib/schedule-share/validation";
import { scheduleShareProposerDisplayName } from "@/lib/schedule-share/proposer-display-name";
import { serializeViewerProposal } from "@/lib/schedule-share/viewer-proposal";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const session = await getSessionUser();
  if (!session?.onboardingComplete) {
    return NextResponse.json(
      { success: false, error: PUBLIC_SCHEDULE_SIGN_IN_REQUIRED },
      { status: 401 },
    );
  }

  const { token } = await params;
  const decoded = decodeURIComponent(token);

  const resolved = await findScheduleShareLinkByPlainToken(prisma, decoded);
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: PUBLIC_SCHEDULE_LINK_UNAVAILABLE },
      { status: 404 },
    );
  }

  const link = resolved.link;

  if (!link.allowGuestProposals) {
    return error("Guest proposals are disabled for this link.", 403);
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return error("Invalid JSON body.", 400);
  }

  const parsed = parseBody(raw, createScheduleShareProposalSchema);
  if (!parsed.ok) return error(parsed.error, 400);

  const startTime = new Date(parsed.data.startTime);
  const endTime = new Date(parsed.data.endTime);

  if (startTime.getTime() < link.rangeStart.getTime() || endTime.getTime() > link.rangeEnd.getTime()) {
    return error("Proposal times must fall within the shared schedule range.", 400);
  }

  const accepted = await prisma.scheduleShareGuestProposal.findFirst({
    where: {
      scheduleShareLinkId: link.id,
      proposerUserId: session.id,
      status: "ACCEPTED",
    },
    select: { id: true },
  });
  if (accepted) {
    return NextResponse.json(
      { success: false, error: PUBLIC_SCHEDULE_PROPOSAL_ALREADY_ACCEPTED },
      { status: 409 },
    );
  }

  const fits = await rangeFitsScheduleShareSnapshot(prisma, {
    ownerUserId: link.ownerUserId,
    rangeStart: link.rangeStart,
    rangeEnd: link.rangeEnd,
    proposalStart: startTime,
    proposalEnd: endTime,
  });

  if (!fits) {
    return NextResponse.json(
      { success: false, error: PUBLIC_SCHEDULE_TIME_UNAVAILABLE },
      { status: 409 },
    );
  }

  const ip = getClientIp(request);
  const ipFingerprint = maybeHashIp(ip);
  const rate = await assertScheduleShareProposalRateLimit(prisma, link.id, ipFingerprint);
  if (!rate.ok) {
    return NextResponse.json({ success: false, error: PUBLIC_SCHEDULE_RATE_LIMIT }, { status: 429 });
  }

  const guestDisplayName = scheduleShareProposerDisplayName(session);

  const ua = request.headers.get("user-agent") ?? "";

  const proposalData = {
    proposerUserId: session.id,
    guestDisplayName,
    guestContact: null,
    title: parsed.data.title.trim(),
    note: parsed.data.note?.trim() || null,
    location: parsed.data.location?.trim() || null,
    startTime,
    endTime,
    createdFromIp: ipFingerprint,
    userAgent: ua.slice(0, 512),
  };

  const pending = await prisma.scheduleShareGuestProposal.findFirst({
    where: {
      scheduleShareLinkId: link.id,
      proposerUserId: session.id,
      status: "PENDING",
    },
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

  const saved = pending
    ? await prisma.scheduleShareGuestProposal.update({
        where: { id: pending.id },
        data: proposalData,
        select: {
          id: true,
          title: true,
          note: true,
          location: true,
          startTime: true,
          endTime: true,
          status: true,
        },
      })
    : await prisma.scheduleShareGuestProposal.create({
        data: {
          scheduleShareLinkId: link.id,
          ...proposalData,
        },
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

  const proposal = serializeViewerProposal(saved);
  if (!proposal) {
    return error("Could not save proposal.", 500);
  }

  return NextResponse.json(
    { success: true, data: { submitted: true, updated: Boolean(pending), proposal } },
    { status: pending ? 200 : 201 },
  );
}
