import { prisma } from "@/lib/db/prisma";
import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { error, ok } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ linkId: string }> },
) {
  const auth = await resolveOnboardedUserForApi();
  if (!auth.ok) return error(auth.error, auth.status);

  const { linkId } = await params;

  const link = await prisma.scheduleShareLink.findFirst({
    where: { id: linkId, ownerUserId: auth.user.id },
    select: { id: true },
  });

  if (!link) return error("Share link not found.", 404);

  await prisma.scheduleShareLink.update({
    where: { id: link.id },
    data: { revokedAt: new Date() },
  });

  return ok({ revoked: true });
}
