import "server-only";

import { prisma } from "@/lib/db/prisma";
import { queueMediaDeletion, processMediaDeletionJobs } from "@/lib/media/lifecycle";
import { mediaStoreConfigured, putStoredMedia, readStoredMedia } from "@/lib/media/storage";

export function isVerificationProofStorageConfigured(): boolean {
  return mediaStoreConfigured("verification");
}

export async function uploadVerificationProof(pathname: string, file: File) {
  return putStoredMedia("verification", pathname, new Uint8Array(await file.arrayBuffer()), file.type);
}

export async function readVerificationProof(url: string) {
  const result = await readStoredMedia("verification", url);
  return result ? { statusCode: 200, stream: result.stream, blob: { size: result.size, contentType: result.contentType } } : null;
}

export async function deleteVerificationProof(url: string) {
  await queueMediaDeletion(prisma, [url]);
  return processMediaDeletionJobs({ urls: [url] });
}
