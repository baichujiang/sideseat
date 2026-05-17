import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { getSessionUser } from "@/lib/auth/session";
import { buildPublicScheduleShareSnapshotForActiveLink } from "@/lib/schedule-share/public-snapshot";
import { PUBLIC_SCHEDULE_LINK_UNAVAILABLE } from "@/lib/schedule-share/public-errors";
import { findScheduleShareLinkByPlainToken } from "@/lib/schedule-share/resolve-link";
import { consumeScheduleShareLinkForVisitor } from "@/lib/schedule-share/usage-limit";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);
  const session = await getSessionUser();

  const resolved = await findScheduleShareLinkByPlainToken(prisma, decoded, {
    viewerUserId: session?.id,
  });
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: PUBLIC_SCHEDULE_LINK_UNAVAILABLE },
      { status: 404 },
    );
  }

  const consumed = await consumeScheduleShareLinkForVisitor(
    prisma,
    resolved.link,
    session?.id,
  );
  if (!consumed) {
    return NextResponse.json(
      { success: false, error: PUBLIC_SCHEDULE_LINK_UNAVAILABLE },
      { status: 404 },
    );
  }

  const snapshot = await buildPublicScheduleShareSnapshotForActiveLink(prisma, resolved.link);

  return NextResponse.json({ success: true, data: snapshot });
}
