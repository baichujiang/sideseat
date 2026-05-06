import { randomBytes } from "crypto";

import { del, put } from "@vercel/blob";

import { requireUser } from "@/lib/auth/session";
import {
  isTrustedUserAvatarBlobUrl,
  userCustomAvatarBlobPrefix,
} from "@/lib/constants/avatars";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

function extForMime(type: string): string {
  if (type === "image/png") return "png";
  if (type === "image/webp") return "webp";
  return "jpg";
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      console.error("[avatar/upload] BLOB_READ_WRITE_TOKEN is not configured.");
      return error("Photo uploads are not configured on the server yet.", 500);
    }

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

    const prev = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    });

    const token = randomBytes(18).toString("hex");
    const ext = extForMime(file.type);
    const blobKey = `${userCustomAvatarBlobPrefix(user.id)}${token}.${ext}`;

    const blob = await put(blobKey, file, {
      access: "public",
      contentType: file.type,
      addRandomSuffix: false,
    });

    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: blob.url },
    });

    const oldUrl = prev?.avatarUrl ?? null;
    if (oldUrl && isTrustedUserAvatarBlobUrl(user.id, oldUrl) && oldUrl !== blob.url) {
      del(oldUrl).catch(() => {});
    }

    return ok({ avatarUrl: blob.url });
  } catch (cause) {
    console.error(cause);
    return error("Could not upload photo.");
  }
}
