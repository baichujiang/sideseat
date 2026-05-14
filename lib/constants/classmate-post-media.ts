const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/** Stable placeholder images for local `prisma db seed` (Lorem Picsum `/seed/…`). */
const PICSUM_HOSTS = new Set(["picsum.photos", "www.picsum.photos"]);
const PICSUM_SEED_PATH = /^\/seed\/[^/]+\/\d+\/\d+$/;

function isSeedDemoHttpsImageUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    if (!PICSUM_HOSTS.has(host)) return false;
    return PICSUM_SEED_PATH.test(u.pathname);
  } catch {
    return false;
  }
}

export function classmatePostImageBlobPrefix(userId: string): string {
  return `classmate-posts/${userId}/`;
}

/**
 * Accepts HTTPS URLs on our Vercel Blob classmate-post prefix for this user, a
 * bounded inline data URL when blob storage is disabled (same pattern as chat images),
 * or HTTPS `picsum.photos/seed/…/w/h` URLs for dev seed data and demos.
 */
export function isAllowedClassmatePostImageUrl(userId: string, url: string): boolean {
  if (typeof url !== "string" || url.length > 4_000_000) return false;
  if (url.startsWith("https://")) {
    if (isSeedDemoHttpsImageUrl(url)) return true;
    try {
      const u = new URL(url);
      if (!u.hostname.toLowerCase().endsWith(BLOB_HOST_SUFFIX)) return false;
      return u.pathname.startsWith(`/${classmatePostImageBlobPrefix(userId)}`);
    } catch {
      return false;
    }
  }
  const prefixes = ["data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"];
  if (!prefixes.some((p) => url.startsWith(p))) return false;
  return url.length <= 2_800_000;
}
