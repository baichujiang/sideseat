/** Public badge eligibility; no expiry or redemption details leave the server. */
export function isPlusMember(expiresAt: Date | null | undefined, now = new Date()): boolean {
  return !!expiresAt && expiresAt > now;
}
