import { NextResponse } from "next/server";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { safeReturnPath } from "@/lib/nav/back";
import { terminalizeConnectionAndDirectV1Contexts } from "@/lib/v2/direct-v1-context-sync";

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
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const fd = await request.formData();
    const raw = fd.get("returnTo");
    formReturnTo = typeof raw === "string" ? raw : null;
  }

  await prisma.$transaction((tx) =>
    terminalizeConnectionAndDirectV1Contexts(tx, {
      connectionId,
      targetStatus: "ENDED",
      connectionEndedById: user.id,
      endedAt: new Date(),
      requiredParticipantId: user.id,
    }),
  );

  const redirectTo = safeReturnPath(formReturnTo ?? qsReturnTo, "/inbox");
  return NextResponse.redirect(new URL(redirectTo, request.url));
}
