const BLOB_HOST_SUFFIX = ".private.blob.vercel-storage.com";

export function chatImageBlobPrefix(connectionId: string): string {
  return `chat/${connectionId}/`;
}

/**
 * New messages may attach only private uploads owned by their sender.
 */
export function isAllowedChatImageUrl(connectionId: string, url: string, senderId: string): boolean {
  if (typeof url !== "string" || url.length > 2048) return false;
  if (url.startsWith("https://")) {
    try {
      const u = new URL(url);
      if (!u.hostname.toLowerCase().endsWith(BLOB_HOST_SUFFIX)) return false;
      const prefix = `/${chatImageBlobPrefix(connectionId)}${senderId}/`;
      return !u.username && !u.password && !u.search && !u.hash && u.pathname.startsWith(prefix) &&
        /^[a-f0-9]{36}\.(jpg|png|webp)$/.test(u.pathname.slice(prefix.length));
    } catch {
      return false;
    }
  }
  return false;
}
