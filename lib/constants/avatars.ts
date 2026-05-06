/**
 * Twenty preset avatars, served as static JPEGs under `/public/avatars/`.
 * `User.avatarUrl` is usually a short id like "p07" → `/avatars/p07.jpeg`.
 * It may also hold a public Vercel Blob URL for a user-uploaded photo under
 * `avatars/custom/<userId>/…` (written only by `/api/profile/avatar/upload`).
 */

export const AVATAR_IDS = [
  "p01", "p02", "p03", "p04", "p05",
  "p06", "p07", "p08", "p09", "p10",
  "p11", "p12", "p13", "p14", "p15",
  "p16", "p17", "p18", "p19", "p20",
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export const DEFAULT_AVATAR_ID: AvatarId = "p01";

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export function userCustomAvatarBlobPrefix(userId: string): string {
  return `avatars/custom/${userId}/`;
}

/** True for HTTPS URLs on Vercel Blob that look safe to render as an image. */
export function isDisplayableCustomAvatarUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  if (!value.startsWith("https://")) return false;
  try {
    const u = new URL(value);
    if (!u.hostname.toLowerCase().endsWith(BLOB_HOST_SUFFIX)) return false;
    return u.pathname.length > 1;
  } catch {
    return false;
  }
}

/** Blob URL under this user's upload prefix (server + client for UI hints). */
export function isTrustedUserAvatarBlobUrl(userId: string, url: string): boolean {
  if (!isDisplayableCustomAvatarUrl(url)) return false;
  try {
    const u = new URL(url);
    const prefix = `/${userCustomAvatarBlobPrefix(userId)}`;
    return u.pathname.startsWith(prefix);
  } catch {
    return false;
  }
}

export function resolveAvatarImageSrc(id?: string | null): string {
  if (isDisplayableCustomAvatarUrl(id)) return id;
  return getAvatarSrc(id);
}

export function getAvatarSrc(id?: string | null): string {
  const safe = isValidAvatarId(id) ? id : DEFAULT_AVATAR_ID;
  return `/avatars/${safe}.jpeg`;
}

export function isValidAvatarId(value: unknown): value is AvatarId {
  return typeof value === "string" && (AVATAR_IDS as readonly string[]).includes(value);
}

export function randomAvatarId(): AvatarId {
  const index = Math.floor(Math.random() * AVATAR_IDS.length);
  return AVATAR_IDS[index];
}
