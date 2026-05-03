import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ shareId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { shareId } = await params;

    const share = await prisma.availabilityShare.findUnique({
      where: { id: shareId },
      select: { id: true, ownerUserId: true, isRevoked: true },
    });

    if (!share) {
      return error("Availability not found.", 404);
    }

    if (share.ownerUserId !== user.id) {
      return error("Only the owner can revoke this availability.", 403);
    }

    if (!share.isRevoked) {
      await prisma.availabilityShare.update({
        where: { id: shareId },
        data: { isRevoked: true },
      });
    }

    return ok({ status: "revoked" });
  } catch (cause) {
    console.error(cause);
    return error("Unable to revoke availability.");
  }
}
