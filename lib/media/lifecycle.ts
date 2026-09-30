import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { deleteStoredMedia, listStoredMedia, mediaStoreConfigured, type MediaStore } from "@/lib/media/storage";

type MediaDb = Pick<Prisma.TransactionClient, "user" | "userLifePhoto" | "classmatePostImage" | "message" | "userSchoolVerification" | "mediaDeletionJob">;
const ORPHAN_GRACE_MS = 24 * 60 * 60 * 1000;

export function managedMediaStore(url: string): MediaStore | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash) return null;
    if (parsed.hostname.endsWith(".public.blob.vercel-storage.com") && /^\/(avatars\/custom|profile\/life-photos|classmate-posts|chat)\/[a-zA-Z0-9_-]+\//.test(parsed.pathname)) return "public";
    if (parsed.hostname.endsWith(".private.blob.vercel-storage.com")) {
      if (/^\/chat\/[a-zA-Z0-9_-]+\//.test(parsed.pathname)) return "chat";
      if (/^\/student-proofs\/[a-zA-Z0-9_-]+\//.test(parsed.pathname)) return "verification";
    }
  } catch { /* Preset IDs, inline legacy data and external seed images are not managed objects. */ }
  return null;
}

export async function queueMediaDeletion(db: Pick<MediaDb, "mediaDeletionJob">, urls: Array<string | null | undefined>) {
  const managed = [...new Set(urls.filter((url): url is string => Boolean(url)))];
  const data = managed.flatMap(url => {
    const store = managedMediaStore(url);
    return store ? [{ url, store }] : [];
  });
  if (data.length) await db.mediaDeletionJob.createMany({ data, skipDuplicates: true });
}

export async function referencedMediaUrls(db: MediaDb, urls: string[]) {
  if (!urls.length) return new Set<string>();
  const [avatars, photos, posts, messages, proofs, legacyProofs] = await Promise.all([
    db.user.findMany({ where: { avatarUrl: { in: urls } }, select: { avatarUrl: true } }),
    db.userLifePhoto.findMany({ where: { url: { in: urls } }, select: { url: true } }),
    db.classmatePostImage.findMany({ where: { url: { in: urls } }, select: { url: true } }),
    db.message.findMany({ where: { imageUrl: { in: urls }, deletedAt: null }, select: { imageUrl: true } }),
    db.userSchoolVerification.findMany({ where: { manualReviewProofUrl: { in: urls } }, select: { manualReviewProofUrl: true } }),
    db.user.findMany({ where: { manualReviewProofUrl: { in: urls } }, select: { manualReviewProofUrl: true } }),
  ]);
  return new Set<string>([
    ...avatars.map(r => r.avatarUrl!), ...photos.map(r => r.url), ...posts.map(r => r.url),
    ...messages.map(r => r.imageUrl!), ...proofs.map(r => r.manualReviewProofUrl!), ...legacyProofs.map(r => r.manualReviewProofUrl!),
  ]);
}

export async function queueAccountMediaDeletion(db: MediaDb, userId: string) {
  const [user, photos, posts, messages, proofs] = await Promise.all([
    db.user.findUnique({ where: { id: userId }, select: { avatarUrl: true, manualReviewProofUrl: true } }),
    db.userLifePhoto.findMany({ where: { userId }, select: { url: true } }),
    db.classmatePostImage.findMany({ where: { post: { userId } }, select: { url: true } }),
    // Deleting an account also cascades its connections and the peer's attachments therein.
    db.message.findMany({ where: { connection: { OR: [{ userAId: userId }, { userBId: userId }] }, imageUrl: { not: null } }, select: { imageUrl: true } }),
    db.userSchoolVerification.findMany({ where: { userId }, select: { manualReviewProofUrl: true } }),
  ]);
  const urls = [user?.avatarUrl, user?.manualReviewProofUrl, ...photos.map(r => r.url), ...posts.map(r => r.url), ...messages.map(r => r.imageUrl), ...proofs.map(r => r.manualReviewProofUrl)];
  await queueMediaDeletion(db, urls);
  return urls.filter((url): url is string => Boolean(url));
}

export async function processMediaDeletionJobs(options: { limit?: number; urls?: string[]; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const jobs = await prisma.mediaDeletionJob.findMany({
    where: { availableAt: { lte: now }, ...(options.urls ? { url: { in: options.urls } } : {}) },
    orderBy: { availableAt: "asc" }, take: Math.min(options.limit ?? 50, 200),
  });
  const referenced = await referencedMediaUrls(prisma, jobs.map(job => job.url));
  let deleted = 0, failed = 0, retained = 0;
  async function remove(job: typeof jobs[number]) {
    if (referenced.has(job.url)) {
      // A replacement was rolled back or the same file is still used elsewhere.
      await prisma.mediaDeletionJob.deleteMany({ where: { id: job.id } });
      retained++;
      return;
    }
    try {
      if (managedMediaStore(job.url) !== job.store) throw new Error("UnmanagedMediaDeletion");
      await deleteStoredMedia(job.store as MediaStore, job.url);
      await prisma.mediaDeletionJob.deleteMany({ where: { id: job.id } });
      deleted++;
    } catch (cause) {
      failed++;
      const retryMs = Math.min(60 * 60_000, 60_000 * 2 ** Math.min(job.attempts, 6));
      await prisma.mediaDeletionJob.updateMany({ where: { id: job.id }, data: {
        attempts: { increment: 1 }, availableAt: new Date(now.getTime() + retryMs),
        lastError: cause instanceof Error ? cause.name : "StorageError",
      } });
    }
  }
  for (let start = 0; start < jobs.length; start += 4) {
    await Promise.all(jobs.slice(start, start + 4).map(remove));
  }
  return { deleted, failed, retained };
}

export async function sweepUnreferencedMedia(options: { now?: Date; batchSize?: number } = {}) {
  const now = options.now ?? new Date();
  let scanned = 0, queued = 0;
  for (const store of ["public", "chat", "verification"] as const) {
    if (!mediaStoreConfigured(store)) continue;
    const state = await prisma.mediaSweepState.findUnique({ where: { store } });
    const page = await listStoredMedia(store, state?.cursor ?? undefined, Math.min(options.batchSize ?? 100, 500));
    const candidates = page.blobs.filter(blob => managedMediaStore(blob.url) === store && blob.uploadedAt.getTime() <= now.getTime() - ORPHAN_GRACE_MS);
    const referenced = await referencedMediaUrls(prisma, candidates.map(blob => blob.url));
    const orphanUrls = candidates.filter(blob => !referenced.has(blob.url)).map(blob => blob.url);
    await prisma.$transaction(async tx => {
      await queueMediaDeletion(tx, orphanUrls);
      await tx.mediaSweepState.upsert({ where: { store }, create: { store, cursor: page.cursor }, update: { cursor: page.cursor } });
    });
    scanned += page.blobs.length;
    queued += orphanUrls.length;
  }
  return { scanned, queued };
}
