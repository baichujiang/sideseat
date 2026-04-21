/**
 * Twenty preset avatars, served as static JPEGs under `/public/avatars/`.
 * `User.avatarUrl` stores a short id like "p07", which maps 1:1 to the file
 * `/avatars/p07.jpeg`. Keeping IDs (not URLs) in the DB means we can swap the
 * actual artwork later without touching user rows.
 */

export const AVATAR_IDS = [
  "p01", "p02", "p03", "p04", "p05",
  "p06", "p07", "p08", "p09", "p10",
  "p11", "p12", "p13", "p14", "p15",
  "p16", "p17", "p18", "p19", "p20",
] as const;

export type AvatarId = (typeof AVATAR_IDS)[number];

export const DEFAULT_AVATAR_ID: AvatarId = "p01";

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
