import { StudentVerificationStatus } from "@prisma/client";

import { requireAdminUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { deleteVerificationProof } from "@/lib/media/verification-proof-storage";
import { mirrorSchoolVerificationToUser, upsertSchoolVerificationState } from "@/lib/verification/school-state";
import { adminVerificationDecisionSchema } from "@/lib/validators/verification";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ userId: string }> },
) {
  try {
    const admin = await requireAdminUser();
    const { userId } = await params;
    const { status, note } = await parseJson(request, adminVerificationDecisionSchema);

    const existing = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        school: true,
        manualReviewProofUrl: true,
        email: true,
      },
    });
    if (!existing?.school) {
      return error("User has no active school selected.", 400);
    }

    const isFinalDecision =
      status === StudentVerificationStatus.VERIFIED ||
      status === StudentVerificationStatus.REJECTED;
    const verifiedAt = status === StudentVerificationStatus.VERIFIED ? new Date() : null;

    await prisma.$transaction(async (tx) => {
      await upsertSchoolVerificationState(tx, userId, existing.school!, {
        email: existing.email ?? null,
        verifiedStudent: status === StudentVerificationStatus.VERIFIED,
        studentVerificationStatus: status,
        studentVerificationMethod: verifiedAt ? "MANUAL_DOCUMENT" : null,
        studentVerifiedAt: verifiedAt,
        emailVerifiedAt: null,
        studentVerificationNotes: note || `Last reviewed by ${admin.adminActor}.`,
        ...(isFinalDecision
          ? {
              manualReviewProofUrl: null,
              manualReviewProofFilename: null,
              manualReviewRequestedAt: null,
            }
          : {}),
      });
      await mirrorSchoolVerificationToUser(tx, userId, existing.school!);
    });

    // Best-effort: purge the uploaded proof from blob storage once a decision
    // is made, so sensitive PII doesn't linger.
    if (isFinalDecision && existing?.manualReviewProofUrl) {
      try {
        await deleteVerificationProof(existing.manualReviewProofUrl);
      } catch (cause) {
        console.error("[admin-verification] failed to delete blob", cause);
      }
    }

    return ok({ userId, status });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update student verification.", 400);
  }
}
