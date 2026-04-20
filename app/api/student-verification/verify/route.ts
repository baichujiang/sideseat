import { NextResponse } from "next/server";
import { StudentVerificationStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return NextResponse.redirect(new URL("/profile?verification=invalid", request.url));
  }

  const verification = await prisma.schoolEmailVerification.findUnique({
    where: {
      token,
    },
  });

  if (!verification || verification.status !== "PENDING" || verification.expiresAt < new Date()) {
    return NextResponse.redirect(new URL("/profile?verification=expired", request.url));
  }

  await prisma.$transaction(async (tx) => {
    await tx.schoolEmailVerification.update({
      where: { id: verification.id },
      data: {
        status: "VERIFIED",
        verifiedAt: new Date(),
      },
    });

    await tx.user.update({
      where: { id: verification.userId },
      data: {
        email: verification.email,
        verifiedStudent: true,
        studentVerificationStatus: StudentVerificationStatus.VERIFIED,
        emailVerifiedAt: new Date(),
        studentVerificationNotes: "Student email verified successfully.",
      },
    });
  });

  return NextResponse.redirect(new URL("/profile?verification=success", request.url));
}
