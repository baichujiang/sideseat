import "server-only";

import { StudentVerificationStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { queueMediaDeletion } from "@/lib/media/lifecycle";
import { manualReviewProofCutoff } from "@/lib/verification/policy";
import { mirrorSchoolVerificationToUser } from "@/lib/verification/school-state";

export async function cleanupStudentVerificationData(options?: {
  now?: Date;
  batchSize?: number;
}) {
  const now = options?.now ?? new Date();
  const batchSize = Math.min(Math.max(options?.batchSize ?? 100, 1), 500);

  const staleProofs = await prisma.userSchoolVerification.findMany({
    where: {
      studentVerificationStatus: StudentVerificationStatus.MANUAL_REVIEW_REQUIRED,
      manualReviewProofUrl: { not: null },
      manualReviewRequestedAt: { lte: manualReviewProofCutoff(now) },
    },
    select: {
      userId: true,
      school: true,
      manualReviewProofUrl: true,
      user: { select: { school: true } },
    },
    take: batchSize,
  });

  let queuedProofCount = 0;
  for (const state of staleProofs) {
    if (!state.manualReviewProofUrl) continue;
    await prisma.$transaction(async (tx) => {
      const changed = await tx.userSchoolVerification.updateMany({
        where: {
          userId: state.userId,
          school: state.school,
          manualReviewProofUrl: state.manualReviewProofUrl,
        },
        data: {
          verifiedStudent: false,
          studentVerificationStatus: StudentVerificationStatus.UNVERIFIED,
          studentVerificationMethod: null,
          studentVerifiedAt: null,
          emailVerifiedAt: null,
          manualReviewProofUrl: null,
          manualReviewProofFilename: null,
          manualReviewRequestedAt: null,
          studentVerificationNotes:
            "The pending document expired after 30 days. Submit a new document if needed.",
        },
      });
      if (changed.count > 0 && state.user.school === state.school) {
        await mirrorSchoolVerificationToUser(tx, state.userId, state.school);
      }
      if (changed.count > 0) await queueMediaDeletion(tx, [state.manualReviewProofUrl]);
      queuedProofCount += changed.count;
    });
  }

  const expiredEmailRequests = await prisma.schoolEmailVerification.updateMany({
    where: { status: "PENDING", expiresAt: { lte: now } },
    data: { status: "EXPIRED" },
  });

  return {
    queuedProofCount,
    expiredEmailRequestCount: expiredEmailRequests.count,
  };
}
