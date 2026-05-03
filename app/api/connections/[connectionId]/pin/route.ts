import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { safeReturnPath } from "@/lib/nav/back";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const user = await requireOnboardedUser();
  const { connectionId } = await params;
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

  const connection = await prisma.connection.findFirst({
    where: {
      id: connectionId,
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    select: {
      id: true,
      userAId: true,
      userBId: true,
      pinnedByAAt: true,
      pinnedByBAt: true,
    },
  });

  if (!connection) {
    return NextResponse.redirect(new URL(safeReturnPath(formReturnTo ?? qsReturnTo, "/inbox"), request.url));
  }

  const isUserA = connection.userAId === user.id;
  const currentlyPinned = isUserA ? Boolean(connection.pinnedByAAt) : Boolean(connection.pinnedByBAt);

  await prisma.connection.update({
    where: { id: connectionId },
    data: isUserA
      ? { pinnedByAAt: currentlyPinned ? null : new Date() }
      : { pinnedByBAt: currentlyPinned ? null : new Date() },
  });

  const redirectTo = safeReturnPath(formReturnTo ?? qsReturnTo, "/inbox");
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
