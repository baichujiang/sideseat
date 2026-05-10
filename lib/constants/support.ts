/** Optional public support address (same env powers {@link getSupportMailto}). */
export function getPublicSupportEmail(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  if (!raw || !raw.includes("@")) return null;
  return raw;
}

/** Optional `mailto:` for non-feedback surfaces (e.g. About). */
export function getSupportMailto(): string | null {
  const raw = getPublicSupportEmail();
  if (!raw) return null;
  return `mailto:${raw}?subject=${encodeURIComponent("SideSeat support")}`;
}

/**
 * Inbox for `/api/feedback` (Resend). Prefer server-only `FEEDBACK_TO_EMAIL`; otherwise falls back to
 * {@link getSupportMailto} address so one env can power both mailto and API delivery.
 */
export function getFeedbackInboxEmail(): string | null {
  const dedicated = process.env.FEEDBACK_TO_EMAIL?.trim();
  if (dedicated && dedicated.includes("@")) return dedicated;
  const pub = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  if (pub && pub.includes("@")) return pub;
  return null;
}
