import { prisma } from "@/lib/db/prisma";
import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { error, ok } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ proposalId: string }> },
) {
  const auth = await resolveOnboardedUserForApi();
  if (!auth.ok) return error(auth.error, auth.status);

  const { proposalId } = await params;

  const proposal = await prisma.scheduleShareGuestProposal.findFirst({
    where: {
      id: proposalId,
      scheduleShareLink: { ownerUserId: auth.user.id },
    },
    select: { id: true, status: true },
  });

  if (!proposal) return error("Proposal not found.", 404);
  if (proposal.status !== "PENDING") {
    return error("This proposal can no longer be updated.", 409);
  }

  const updated = await prisma.scheduleShareGuestProposal.updateMany({
    where: { id: proposalId, status: "PENDING" },
    data: { status: "DECLINED" },
  });

  if (updated.count !== 1) return error("This proposal can no longer be updated.", 409);

  return ok({ declined: true });
}
