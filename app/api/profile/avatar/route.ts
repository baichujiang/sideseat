import { requireUser } from "@/lib/auth/session";
import { isValidAvatarId } from "@/lib/constants/avatars";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";
import { queueMediaDeletion, processMediaDeletionJobs } from "@/lib/media/lifecycle";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { avatarId } = (await request.json().catch(() => ({}))) as { avatarId?: unknown };

    if (!isValidAvatarId(avatarId)) {
      return error("Pick one of the available avatars.");
    }

    const previous = await prisma.$transaction(async tx => {
      const previous = await tx.user.findUnique({ where: { id: user.id }, select: { avatarUrl: true } });
      await tx.user.update({ where: { id: user.id }, data: { avatarUrl: avatarId } });
      await queueMediaDeletion(tx, [previous?.avatarUrl]);
      return previous?.avatarUrl;
    });
    if (previous) await processMediaDeletionJobs({ urls: [previous] });

    return ok({ avatarId });
  } catch (cause) {
    console.error(cause);
    return error("Could not save avatar.");
  }
}
