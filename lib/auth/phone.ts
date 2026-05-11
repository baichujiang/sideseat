/**
 * Normalize phone numbers toward E.164 for storage and lookup.
 * - If input starts with "+", strip non-digits after it (except keep leading +).
 * - CN mobile: 11 digits starting with 1 → +86…
 * - US: 10 digits, first digit 2–9 → +1…
 */
export function normalizePhone(raw: string): string | null {
  const t = raw.trim().replace(/[\s-]/g, "");
  if (!t) return null;

  if (t.startsWith("+")) {
    const digits = t.slice(1).replace(/\D/g, "");
    if (digits.length < 8 || digits.length > 15) return null;
    return `+${digits}`;
  }

  const digits = t.replace(/\D/g, "");
  if (digits.length === 11 && /^1\d{10}$/.test(digits)) {
    return `+86${digits}`;
  }
  if (digits.length === 10 && /^[2-9]\d{9}$/.test(digits)) {
    return `+1${digits}`;
  }
  return null;
}
