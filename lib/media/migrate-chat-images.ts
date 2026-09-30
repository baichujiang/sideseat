import "server-only";

import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { readChatImage } from "@/lib/media/chat-image-storage";
import { putStoredMedia } from "@/lib/media/storage";
import { processMediaDeletionJobs, queueMediaDeletion } from "@/lib/media/lifecycle";

export async function migrateLegacyChatImages(options: { apply?: boolean; limit?: number } = {}) {
  const where = { type: "IMAGE" as const, deletedAt: null, imageUrl: { not: null }, NOT: { imageUrl: { contains: ".private.blob.vercel-storage.com/" } } };
  const remainingBefore = await prisma.message.count({ where });
  if (!options.apply) return { remainingBefore, migrated: 0, failed: 0, remainingAfter: remainingBefore };
  const messages = await prisma.message.findMany({ where, orderBy: { id: "asc" }, take: Math.min(options.limit ?? 100, 200) });
  let migrated = 0, failed = 0;
  const deletionUrls: string[] = [];
  for (const message of messages) {
    let newUrl: string | undefined;
    try {
      const image = await readChatImage(message.imageUrl!, message.connectionId);
      if (!image) throw new Error("LegacyImageUnavailable");
      const bytes = new Uint8Array(await new Response(image.stream).arrayBuffer());
      const ext = image.contentType === "image/png" ? "png" : image.contentType === "image/webp" ? "webp" : "jpg";
      const uploaded = await putStoredMedia("chat", `chat/${message.connectionId}/${message.senderId}/${randomBytes(18).toString("hex")}.${ext}`, bytes, image.contentType);
      newUrl = uploaded.url;
      const changed = await prisma.$transaction(async tx => {
        const changed = await tx.message.updateMany({ where: { id: message.id, imageUrl: message.imageUrl, deletedAt: null }, data: { imageUrl: uploaded.url } });
        const removed = changed.count ? message.imageUrl! : uploaded.url;
        await queueMediaDeletion(tx, [removed]);
        deletionUrls.push(removed);
        return changed.count;
      });
      migrated += changed;
    } catch {
      failed++;
      if (newUrl) await queueMediaDeletion(prisma, [newUrl]);
    }
  }
  const deletion = await processMediaDeletionJobs({ urls: deletionUrls, limit: 200 });
  return { remainingBefore, migrated, failed, remainingAfter: await prisma.message.count({ where }), deletion };
}
