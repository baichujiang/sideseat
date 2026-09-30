import { MediaUploadRateLimitError } from "@/lib/media/upload-allowance";
import { NativeImageUploadError, uploadNativeImage, validateNativeImageFile } from "@/lib/media/native-image-upload";
import { MediaStorageUnavailableError } from "@/lib/media/private-blob";

import { requireUser } from "@/lib/auth/session";
import {
  USER_LIFE_PHOTO_MAX,
  userLifePhotoBlobPrefix,
} from "@/lib/constants/user-life-photo-media";
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

    const count = await prisma.userLifePhoto.count({ where: { userId: user.id } });
    if (count >= USER_LIFE_PHOTO_MAX) {
      return error(`You can add at most ${USER_LIFE_PHOTO_MAX} life photos.`, 400);
    }

    const { url } = await uploadNativeImage({ userId: user.id, image, blobPrefix: userLifePhotoBlobPrefix(user.id), logScope: "profile/life-photos" });

    const photo = await prisma.$transaction(async (tx) => {
      const existing = await tx.userLifePhoto.findMany({
        where: { userId: user.id },
        select: { sortOrder: true },
        orderBy: { sortOrder: "asc" },
      });
      const used = new Set(existing.map((r) => r.sortOrder));
      let sortOrder = 0;
      while (used.has(sortOrder) && sortOrder < USER_LIFE_PHOTO_MAX) sortOrder += 1;
      if (sortOrder >= USER_LIFE_PHOTO_MAX) {
        throw new Error("MAX_LIFE_PHOTOS");
      }
      return tx.userLifePhoto.create({
        data: { userId: user.id, url, sortOrder },
        select: { id: true, url: true, sortOrder: true, createdAt: true },
      });
    });

    return ok({ photo }, { status: 201 });
  } catch (cause) {
    if (cause instanceof MediaUploadRateLimitError) return Response.json({ success: false, error: cause.message, code: "RATE_LIMITED" }, { status: 429, headers: cause.headers });
    if (cause instanceof NativeImageUploadError) return error(cause.message, 400);
    if (cause instanceof MediaStorageUnavailableError) return error(cause.message, 503);
    if (cause instanceof Error && cause.message === "MAX_LIFE_PHOTOS") {
      return error(`You can add at most ${USER_LIFE_PHOTO_MAX} life photos.`, 400);
    }
    console.error(cause);
    return error("Could not upload photo.");
  }
}
