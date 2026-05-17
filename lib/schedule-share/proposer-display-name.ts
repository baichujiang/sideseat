/** Display label for a logged-in schedule-share proposer (falls back for legacy rows). */
export function scheduleShareProposerDisplayName(
  user: { nickname: string | null; username: string } | null | undefined,
  guestDisplayNameFallback?: string | null,
): string {
  const fromProfile = user?.nickname?.trim() || user?.username?.trim();
  if (fromProfile) return fromProfile;
  const legacy = guestDisplayNameFallback?.trim();
  if (legacy) return legacy;
  return "ClassLink user";
}
