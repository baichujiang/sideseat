import "server-only";

import { readStoredMedia } from "@/lib/media/storage";
import { localMediaEnabled } from "@/lib/media/private-blob";

/** Transitional read for existing messages; new uploads are always private. */
export async function readChatImage(url: string, connectionId: string) {
  if (url.startsWith("data:image/")) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(url);
    if (!match || match[2].length > 2_800_000) return null;
    return { stream: new Blob([Buffer.from(match[2], "base64")]).stream(), contentType: match[1] };
  }
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.search || parsed.hash ||
      !parsed.pathname.startsWith(`/chat/${connectionId}/`)) return null;
  if (parsed.hostname.endsWith(".private.blob.vercel-storage.com")) return readStoredMedia("chat", url);
  if (!parsed.hostname.endsWith(".public.blob.vercel-storage.com")) return null;
  if (localMediaEnabled()) return readStoredMedia("public", url);
  const response = await fetch(url, { redirect: "error", cache: "no-store", signal: AbortSignal.timeout(10_000) });
  if (!response.ok || !response.body) return null;
  const contentType = response.headers.get("content-type")?.split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(contentType ?? "")) return null;
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2 * 1024 * 1024) return null;
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  return { stream: new Blob(chunks.map(chunk => new Uint8Array(chunk))).stream(), contentType: contentType! };
}
