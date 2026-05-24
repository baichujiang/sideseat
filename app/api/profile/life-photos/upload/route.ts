import { randomBytes } from "crypto";

import { del, put } from "@vercel/blob";

import { requireUser } from "@/lib/auth/session";
import {
  USER_LIFE_PHOTO_MAX,
  isTrustedUserLifePhotoBlobUrl,
  userLifePhotoBlobPrefix,
} from "@/lib/constants/user-life-photo-media";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extForMime(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

async function fileToDataUrl(file: File): Promise<string> {
  const bytes = Buffer.from(await file.arrayBuffer());
  return `data:${file.type};base64,${bytes.toString("base64")}`;
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return error("Choose a JPG, PNG, or WEBP image.");
    }

    if (file.size === 0) {
      return error("The file is empty.");
    }

    if (file.size > MAX_BYTES) {
      return error("Image is too large. Max 2 MB.");
    }

    if (!ALLOWED_TYPES.has(file.type)) {
      return error("Use JPG, PNG, or WEBP.");
    }

    const count = await prisma.userLifePhoto.count({ where: { userId: user.id } });
    if (count >= USER_LIFE_PHOTO_MAX) {
      return error(`You can add at most ${USER_LIFE_PHOTO_MAX} life photos.`, 400);
    }

    let url: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const token = randomBytes(18).toString("hex");
      const ext = extForMime(file.type);
      const blobKey = `${userLifePhotoBlobPrefix(user.id)}${token}.${ext}`;
      const blob = await put(blobKey, file, {
        access: "public",
        contentType: file.type,
        addRandomSuffix: false,
      });
      url = blob.url;
    } else {
      console.warn(
        "[life-photos/upload] BLOB_READ_WRITE_TOKEN is not configured. Falling back to inline image storage.",
      );
      url = await fileToDataUrl(file);
    }

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
    if (cause instanceof Error && cause.message === "MAX_LIFE_PHOTOS") {
      return error(`You can add at most ${USER_LIFE_PHOTO_MAX} life photos.`, 400);
    }
    console.error(cause);
    return error("Could not upload photo.");
  }
}
