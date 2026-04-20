import { mkdir, writeFile } from "fs/promises";
import path from "path";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

const MAX_BYTES = 2 * 1024 * 1024;
const ALLOWED = new Map([
  ["image/jpeg", "jpg"],
  ["image/png", "png"],
  ["image/webp", "webp"],
]);

/**
 * Avatar uploads currently write to the local filesystem under
 * `public/uploads/avatars/`. That works in dev, but serverless hosts like
 * Vercel expose a read-only FS and files vanish between requests. Until a
 * Blob/S3 backend is wired up, refuse early with a clear message instead of
 * crashing in production.
 */
function isEphemeralFilesystem(): boolean {
  if (process.env.AVATAR_STORAGE === "local") return false;
  return Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();

    if (isEphemeralFilesystem()) {
      return error(
        "Photo uploads aren't enabled on this deployment yet. Skip this for now — the rest of your profile still saves.",
      );
    }

    const formData = await request.formData();
    const file = formData.get("file");

    if (!file || !(file instanceof File)) {
      return error("Choose an image file.");
    }

    if (file.size > MAX_BYTES) {
      return error("Image must be 2MB or smaller.");
    }

    const ext = ALLOWED.get(file.type);
    if (!ext) {
      return error("Use JPG, PNG, or WebP.");
    }

    const filename = `${user.id}-${Date.now()}.${ext}`;
    const uploadDir = path.join(process.cwd(), "public", "uploads", "avatars");
    await mkdir(uploadDir, { recursive: true });

    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(path.join(uploadDir, filename), buffer);

    const publicPath = `/uploads/avatars/${filename}`;

    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: publicPath },
    });

    return ok({ url: publicPath });
  } catch (cause) {
    console.error(cause);
    return error("Could not upload photo.");
  }
}
