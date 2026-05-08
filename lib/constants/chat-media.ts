const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export function chatImageBlobPrefix(connectionId: string): string {
  return `chat/${connectionId}/`;
}

/**
 * Accepts HTTPS URLs on our Vercel Blob chat prefix for this connection, or a
 * bounded inline data URL when blob storage is disabled (same pattern as avatar upload).
 */
export function isAllowedChatImageUrl(connectionId: string, url: string): boolean {
  if (typeof url !== "string" || url.length > 4_000_000) return false;
  if (url.startsWith("https://")) {
    try {
      const u = new URL(url);
      if (!u.hostname.toLowerCase().endsWith(BLOB_HOST_SUFFIX)) return false;
      return u.pathname.startsWith(`/${chatImageBlobPrefix(connectionId)}`);
    } catch {
      return false;
    }
  }
  const prefixes = ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"];
  if (!prefixes.some((p) => url.startsWith(p))) return false;
  return url.length <= 2_800_000;
}
