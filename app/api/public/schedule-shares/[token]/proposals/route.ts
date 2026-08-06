import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { parseBody, error } from "@/lib/http";
import { publicErrorForScheduleShareConnection } from "@/lib/schedule-share/connection-errors";
import { submitScheduleSharePlanProposal } from "@/lib/schedule-share/create-plan-from-guest-proposal";
import {
  PUBLIC_SCHEDULE_LINK_UNAVAILABLE,
  PUBLIC_SCHEDULE_RATE_LIMIT,
  PUBLIC_SCHEDULE_SIGN_IN_REQUIRED,
  PUBLIC_SCHEDULE_TIME_UNAVAILABLE,
} from "@/lib/schedule-share/public-errors";
import { assertScheduleShareProposalRateLimit, getClientIp, maybeHashIp } from "@/lib/schedule-share/rate-limit";
import { findScheduleShareLinkByPlainToken } from "@/lib/schedule-share/resolve-link";
import { consumeScheduleShareLinkForVisitor } from "@/lib/schedule-share/usage-limit";
import { rangeFitsScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { parseRevealConfigJson } from "@/lib/schedule-share/reveal-config";
import { createScheduleShareProposalSchema } from "@/lib/schedule-share/validation";
import { scheduleShareProposerDisplayName } from "@/lib/schedule-share/proposer-display-name";

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

  const resolved = await findScheduleShareLinkByPlainToken(prisma, decoded, {
    viewerUserId: session.id,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: PUBLIC_SCHEDULE_LINK_UNAVAILABLE },
      { status: 404 },
    );
  }

  const link = resolved.link;

  const consumed = await consumeScheduleShareLinkForVisitor(prisma, link, session.id);
  if (!consumed) {
    return NextResponse.json(
      { success: false, error: PUBLIC_SCHEDULE_LINK_UNAVAILABLE },
      { status: 404 },
    );
  }

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

  const fits = await rangeFitsScheduleShareSnapshot(prisma, {
    ownerUserId: link.ownerUserId,
    rangeStart: link.rangeStart,
    rangeEnd: link.rangeEnd,
    proposalStart: startTime,
    proposalEnd: endTime,
    includedDates: parseRevealConfigJson(link.revealConfig).includedDates,
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

  const result = await submitScheduleSharePlanProposal(prisma, {
    scheduleShareLinkId: link.id,
    ownerUserId: link.ownerUserId,
    proposerUserId: session.id,
    title: parsed.data.title.trim(),
    note: parsed.data.note?.trim() || null,
    location: parsed.data.location?.trim() || null,
    startTime,
    endTime,
    guestDisplayName,
    createdFromIp: ipFingerprint,
    userAgent: ua,
  });

  if (!result.ok) {
    const err = publicErrorForScheduleShareConnection(result.reason);
    return NextResponse.json({ success: false, error: err.message }, { status: err.status });
  }

  return NextResponse.json(
    {
      success: true,
      data: {
        submitted: true,
        updated: result.updated,
        proposal: result.proposal,
      },
    },
    { status: result.updated ? 200 : 201 },
  );
}
