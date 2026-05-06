/** Optional user-facing support address; set `NEXT_PUBLIC_SUPPORT_EMAIL` to show on Me → Account. */
export function getSupportMailto(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  if (!raw || !raw.includes("@")) {
    return null;
  }
  return `mailto:${raw}?subject=${encodeURIComponent("SideSeat support")}`;
}
