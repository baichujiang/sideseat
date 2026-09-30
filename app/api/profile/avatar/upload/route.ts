import { MediaUploadRateLimitError } from "@/lib/media/upload-allowance";
import { NativeImageUploadError, uploadNativeImage, validateNativeImageFile } from "@/lib/media/native-image-upload";
import { MediaStorageUnavailableError } from "@/lib/media/private-blob";
import { queueMediaDeletion, processMediaDeletionJobs } from "@/lib/media/lifecycle";

import { requireUser } from "@/lib/auth/session";
import {
  isTrustedUserAvatarBlobUrl,
  userCustomAvatarBlobPrefix,
} from "@/lib/constants/avatars";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return error("Choose a JPG, PNG, or WEBP image.");
    }

    const image = await validateNativeImageFile(file);

    const prev = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    });

    const { url: nextAvatarUrl } = await uploadNativeImage({ userId: user.id, image, blobPrefix: userCustomAvatarBlobPrefix(user.id), logScope: "profile/avatar" });

    await prisma.$transaction(async tx => {
      await tx.user.update({ where: { id: user.id }, data: { avatarUrl: nextAvatarUrl } });
      await queueMediaDeletion(tx, [prev?.avatarUrl]);
    });

    const oldUrl = prev?.avatarUrl ?? null;
    if (oldUrl && isTrustedUserAvatarBlobUrl(user.id, oldUrl) && oldUrl !== nextAvatarUrl) {
      await processMediaDeletionJobs({ urls: [oldUrl] });
    }

    return ok({ avatarUrl: nextAvatarUrl });
  } catch (cause) {
    if (cause instanceof MediaUploadRateLimitError) return Response.json({ success: false, error: cause.message, code: "RATE_LIMITED" }, { status: 429, headers: cause.headers });
    if (cause instanceof NativeImageUploadError) return error(cause.message, 400);
    if (cause instanceof MediaStorageUnavailableError) return error(cause.message, 503);
    console.error(cause);
    return error("Could not upload photo.");
  }
}
