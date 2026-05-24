const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

const INLINE_DATA_URL_PREFIXES = [
  "data:image/jpeg;base64,",
  "data:image/png;base64,",
  "data:image/webp;base64,",
];

/** Max profile life photos per user (`UserLifePhoto.sortOrder` is 0..5). */
export const USER_LIFE_PHOTO_MAX = 6;

export function userLifePhotoBlobPrefix(userId: string): string {
  return `profile/life-photos/${userId}/`;
}

/**
 * Accepts HTTPS URLs on our Vercel Blob life-photo prefix for this user, or a
 * bounded inline data URL when blob storage is disabled (same pattern as avatar upload).
 */
export function isAllowedUserLifePhotoUrl(userId: string, url: string): boolean {
  if (typeof url !== "string" || url.length > 4_000_000) return false;
  if (url.startsWith("https://")) {
    try {
      const u = new URL(url);
      if (!u.hostname.toLowerCase().endsWith(BLOB_HOST_SUFFIX)) return false;
      return u.pathname.startsWith(`/${userLifePhotoBlobPrefix(userId)}`);
    } catch {
      return false;
    }
  }
  if (!INLINE_DATA_URL_PREFIXES.some((p) => url.startsWith(p))) return false;
  return url.length <= 2_800_000;
}

export function isTrustedUserLifePhotoBlobUrl(userId: string, url: string): boolean {
  if (!url.startsWith("https://")) return false;
  try {
    const u = new URL(url);
    if (!u.hostname.toLowerCase().endsWith(BLOB_HOST_SUFFIX)) return false;
    return u.pathname.startsWith(`/${userLifePhotoBlobPrefix(userId)}`);
  } catch {
    return false;
  }
}
