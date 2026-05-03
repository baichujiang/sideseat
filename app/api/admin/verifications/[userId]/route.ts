import { StudentVerificationStatus } from "@prisma/client";
import { del } from "@vercel/blob";

import { requireAdminUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
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
      select: { manualReviewProofUrl: true },
    });

    const isFinalDecision =
      status === StudentVerificationStatus.VERIFIED ||
      status === StudentVerificationStatus.REJECTED;

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        verifiedStudent: status === StudentVerificationStatus.VERIFIED,
        studentVerificationStatus: status,
        emailVerifiedAt:
          status === StudentVerificationStatus.VERIFIED ? new Date() : null,
        studentVerificationNotes: note || `Last reviewed by ${admin.email}.`,
        ...(isFinalDecision
          ? {
              manualReviewProofUrl: null,
              manualReviewProofFilename: null,
              manualReviewRequestedAt: null,
            }
          : {}),
      },
    });

    // Best-effort: purge the uploaded proof from blob storage once a decision
    // is made, so sensitive PII doesn't linger.
    if (isFinalDecision && existing?.manualReviewProofUrl) {
      try {
        await del(existing.manualReviewProofUrl);
      } catch (cause) {
        console.error("[admin-verification] failed to delete blob", cause);
      }
    }

    return ok({ userId: user.id, status: user.studentVerificationStatus });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update student verification.", 400);
  }
}
