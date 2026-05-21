/** Canonical form for signup, OTP, and login lookup (one account per address). */
export function normalizeSignupEmail(raw: string): string | null {
  const email = raw.trim().toLowerCase();
  if (!email || email.length > 254) return null;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}
