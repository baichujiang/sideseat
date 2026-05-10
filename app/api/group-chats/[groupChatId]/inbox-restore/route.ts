import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { safeReturnPath } from "@/lib/nav/back";

/** Show this group in Chats again after it was hidden from the list. */
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

  await prisma.groupChatParticipant.updateMany({
    where: { userId: user.id, groupChatId },
    data: { inboxHiddenAt: null },
  });

  const redirectTo = safeReturnPath(formReturnTo ?? qsReturnTo, `/groups/${groupChatId}`);
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
