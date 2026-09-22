import { NextResponse } from "next/server";
import { createHash } from "crypto";
import { StudentVerificationStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { deleteVerificationProof } from "@/lib/media/verification-proof-storage";
import { mirrorSchoolVerificationToUser, upsertSchoolVerificationState } from "@/lib/verification/school-state";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/profile?verification=invalid", request.url));
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  let verification = await prisma.schoolEmailVerification.findUnique({
    where: {
      token: tokenHash,
    },
    include: {
      user: {
        select: { school: true },
      },
    },
  });

  // Keep already-issued development links working across this security upgrade.
  if (!verification && process.env.NODE_ENV !== "production") {
    verification = await prisma.schoolEmailVerification.findUnique({
      where: { token },
      include: {
        user: {
          select: { school: true },
        },
      },
    });
  }

  if (!verification || verification.status !== "PENDING" || verification.expiresAt < new Date()) {
    return NextResponse.redirect(new URL("/profile?verification=expired", request.url));
  }

  const verifiedAt = new Date();
  const existingState = await prisma.userSchoolVerification.findUnique({
    where: {
      userId_school: {
        userId: verification.userId,
        school: verification.school,
      },
    },
    select: { manualReviewProofUrl: true },
  });

  await prisma.$transaction(async (tx) => {
    await tx.schoolEmailVerification.update({
      where: { id: verification.id },
      data: {
        status: "VERIFIED",
        verifiedAt,
      },
    });

    await upsertSchoolVerificationState(tx, verification.userId, verification.school, {
      email: verification.email,
      verifiedStudent: true,
      studentVerificationStatus: StudentVerificationStatus.VERIFIED,
      studentVerificationMethod: "SCHOOL_EMAIL",
      studentVerifiedAt: verifiedAt,
      emailVerifiedAt: verifiedAt,
      studentVerificationNotes: "School identity verified by school email.",
      manualReviewProofUrl: null,
      manualReviewProofFilename: null,
      manualReviewRequestedAt: null,
    });

    if (verification.user.school === verification.school) {
      await mirrorSchoolVerificationToUser(tx, verification.userId, verification.school);
    }
  });

  if (existingState?.manualReviewProofUrl) {
    try {
      await deleteVerificationProof(existingState.manualReviewProofUrl);
    } catch (cause) {
      console.error("[verification] failed to delete proof after email verification", cause);
    }
  }

  return NextResponse.redirect(new URL("/profile?verification=success", request.url));
}
