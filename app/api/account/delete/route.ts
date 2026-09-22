import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";

import { destroySession, getSessionUser } from "@/lib/auth/session";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import {
  deleteVerificationProofsForUser,
  isVerificationProofStorageConfigured,
} from "@/lib/media/verification-proof-storage";

export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const verificationProofs = await prisma.userSchoolVerification.findMany({
      where: { userId: user.id, manualReviewProofUrl: { not: null } },
      select: { manualReviewProofUrl: true },
    });
    const knownProofUrls = verificationProofs.map((row) => row.manualReviewProofUrl);
    if (isVerificationProofStorageConfigured() || knownProofUrls.length > 0) {
      await deleteVerificationProofsForUser(user.id, knownProofUrls);
    }
    await prisma.user.delete({ where: { id: user.id } });
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("account/delete");
      return NextResponse.json({ error: "Service temporarily unavailable" }, { status: 503 });
    }
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2025") {
      await destroySession();
      const accept = request.headers.get("accept") ?? "";
      if (accept.includes("application/json")) {
        return NextResponse.json({ success: true });
      }
      return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
    }
    throw cause;
  }

  await destroySession();

  const accept = request.headers.get("accept") ?? "";
  if (accept.includes("application/json")) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.redirect(new URL("/login", process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"));
}
