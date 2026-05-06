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

    const prev = await prisma.user.findUnique({
      where: { id: user.id },
      select: { avatarUrl: true },
    });

    let nextAvatarUrl: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const token = randomBytes(18).toString("hex");
      const ext = extForMime(file.type);
      const blobKey = `${userCustomAvatarBlobPrefix(user.id)}${token}.${ext}`;

      const blob = await put(blobKey, file, {
        access: "public",
        contentType: file.type,
        addRandomSuffix: false,
      });
      nextAvatarUrl = blob.url;
    } else {
      console.warn("[avatar/upload] BLOB_READ_WRITE_TOKEN is not configured. Falling back to inline avatar storage.");
      nextAvatarUrl = await fileToDataUrl(file);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: nextAvatarUrl },
    });

    const oldUrl = prev?.avatarUrl ?? null;
    if (oldUrl && isTrustedUserAvatarBlobUrl(user.id, oldUrl) && oldUrl !== nextAvatarUrl) {
      del(oldUrl).catch(() => {});
    }

    return ok({ avatarUrl: nextAvatarUrl });
  } catch (cause) {
    console.error(cause);
    return error("Could not upload photo.");
  }
}
