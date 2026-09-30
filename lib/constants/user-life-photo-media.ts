const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/** Max profile life photos per user (`UserLifePhoto.sortOrder` is 0..5). */
export const USER_LIFE_PHOTO_MAX = 6;

export function userLifePhotoBlobPrefix(userId: string): string {
  return `profile/life-photos/${userId}/`;
}

/**
 * Accepts HTTPS URLs on our Vercel Blob life-photo prefix for this user.
 */
export function isAllowedUserLifePhotoUrl(userId: string, url: string): boolean {
  if (typeof url !== "string" || url.length > 2048) return false;
  if (url.startsWith("https://")) {
    try {
      const u = new URL(url);
      if (!u.hostname.toLowerCase().endsWith(BLOB_HOST_SUFFIX)) return false;
      return u.pathname.startsWith(`/${userLifePhotoBlobPrefix(userId)}`);
    } catch {
      return false;
    }
  }
  return false;
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
