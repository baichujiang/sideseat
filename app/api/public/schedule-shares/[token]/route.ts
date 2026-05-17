import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";
import { buildPublicScheduleShareSnapshotForActiveLink } from "@/lib/schedule-share/public-snapshot";
import { PUBLIC_SCHEDULE_LINK_UNAVAILABLE } from "@/lib/schedule-share/public-errors";
import { findScheduleShareLinkByPlainToken } from "@/lib/schedule-share/resolve-link";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const decoded = decodeURIComponent(token);

  const resolved = await findScheduleShareLinkByPlainToken(prisma, decoded);
  if (!resolved.ok) {
    return NextResponse.json(
      { success: false, error: PUBLIC_SCHEDULE_LINK_UNAVAILABLE },
      { status: 404 },
    );
  }

  const snapshot = await buildPublicScheduleShareSnapshotForActiveLink(prisma, resolved.link);

  return NextResponse.json({ success: true, data: snapshot });
}
