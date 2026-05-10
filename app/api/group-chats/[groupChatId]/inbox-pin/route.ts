import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { safeReturnPath } from "@/lib/nav/back";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  const user = await requireOnboardedUser();
  const { groupChatId } = await params;
  const url = new URL(request.url);
  const qsReturnTo = url.searchParams.get("returnTo");
  let formReturnTo: string | null = null;

  const contentType = request.headers.get("content-type") ?? "";
  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const fd = await request.formData();
    const raw = fd.get("returnTo");
    formReturnTo = typeof raw === "string" ? raw : null;
  }

  const membership = await prisma.groupChatParticipant.findUnique({
    where: { groupChatId_userId: { groupChatId, userId: user.id } },
    select: { inboxPinnedAt: true },
  });

  if (!membership) {
    return NextResponse.redirect(new URL(safeReturnPath(formReturnTo ?? qsReturnTo, "/inbox"), request.url));
  }

  const nextPinned = membership.inboxPinnedAt ? null : new Date();
  await prisma.groupChatParticipant.update({
    where: { groupChatId_userId: { groupChatId, userId: user.id } },
    data: { inboxPinnedAt: nextPinned },
  });

  const redirectTo = safeReturnPath(formReturnTo ?? qsReturnTo, "/inbox");
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
