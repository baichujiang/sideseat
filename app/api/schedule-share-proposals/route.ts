import { prisma } from "@/lib/db/prisma";
import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { error, ok } from "@/lib/http";

export async function GET() {
  const auth = await resolveOnboardedUserForApi();
  if (!auth.ok) return error(auth.error, auth.status);

  const proposals = await prisma.scheduleShareGuestProposal.findMany({
    where: {
      scheduleShareLink: { ownerUserId: auth.user.id },
      status: "PENDING",
    },
    include: {
      scheduleShareLink: { select: { id: true, rangeStart: true, rangeEnd: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return ok({
    proposals: proposals.map((p) => ({
      id: p.id,
      scheduleShareLinkId: p.scheduleShareLinkId,
      linkRangeStart: p.scheduleShareLink.rangeStart.toISOString(),
      linkRangeEnd: p.scheduleShareLink.rangeEnd.toISOString(),
      guestDisplayName: p.guestDisplayName,
      guestContact: p.guestContact,
      title: p.title,
      note: p.note,
      location: p.location,
      startTime: p.startTime.toISOString(),
      endTime: p.endTime.toISOString(),
      status: p.status,
      createdAt: p.createdAt.toISOString(),
    })),
  });
}
