import { StudentVerificationStatus } from "@prisma/client";

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

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        verifiedStudent: status === StudentVerificationStatus.VERIFIED,
        studentVerificationStatus: status,
        emailVerifiedAt:
          status === StudentVerificationStatus.VERIFIED ? new Date() : null,
        studentVerificationNotes: note || `Last reviewed by ${admin.email}.`,
      },
    });

    return ok({ userId: user.id, status: user.studentVerificationStatus });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update student verification.", 400);
  }
}
