import { queueMediaDeletion, processMediaDeletionJobs } from "@/lib/media/lifecycle";

import { requireUser } from "@/lib/auth/session";
import { isTrustedUserLifePhotoBlobUrl } from "@/lib/constants/user-life-photo-media";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ photoId: string }> },
) {
  try {
    const user = await requireUser();
    const { photoId } = await params;

    const photo = await prisma.userLifePhoto.findFirst({
      where: { id: photoId, userId: user.id },
      select: { id: true, url: true },
    });
    if (!photo) {
      return error("Photo not found.", 404);
    }

    await prisma.$transaction(async tx => {
      await tx.userLifePhoto.delete({ where: { id: photo.id } });
      await queueMediaDeletion(tx, [photo.url]);
    });

    if (isTrustedUserLifePhotoBlobUrl(user.id, photo.url)) {
      await processMediaDeletionJobs({ urls: [photo.url] });
    }

    return ok({ deleted: true });
  } catch (cause) {
    console.error(cause);
    return error("Could not remove photo.");
  }
}
