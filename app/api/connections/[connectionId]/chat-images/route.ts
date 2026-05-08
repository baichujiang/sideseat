import { ConnectionStatus } from "@prisma/client";
import { randomBytes } from "crypto";
import { put } from "@vercel/blob";

import { requireOnboardedUser } from "@/lib/auth/guards";
import { chatImageBlobPrefix } from "@/lib/constants/chat-media";
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

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { connectionId } = await params;

    const connection = await prisma.connection.findFirst({
      where: {
        id: connectionId,
        status: ConnectionStatus.ACTIVE,
        userA: {
          moderationBlocks: {
            none: {
              isActive: true,
            },
          },
        },
        userB: {
          moderationBlocks: {
            none: {
              isActive: true,
            },
          },
        },
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
    });

    if (!connection) {
      return error("Connection not found.", 404);
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

    let url: string;
    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const token = randomBytes(18).toString("hex");
      const ext = extForMime(file.type);
      const blobKey = `${chatImageBlobPrefix(connectionId)}${token}.${ext}`;
      const blob = await put(blobKey, file, {
        access: "public",
        contentType: file.type,
        addRandomSuffix: false,
      });
      url = blob.url;
    } else {
      console.warn(
        "[chat-images] BLOB_READ_WRITE_TOKEN is not configured. Falling back to inline image storage.",
      );
      url = await fileToDataUrl(file);
    }

    return ok({ url });
  } catch (cause) {
    console.error(cause);
    return error("Could not upload photo.");
  }
}
