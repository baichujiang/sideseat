/** Optional user-facing support address; set `NEXT_PUBLIC_SUPPORT_EMAIL` to show on Me → Account. */
export function getSupportMailto(): string | null {
  const raw = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
  if (!raw || !raw.includes("@")) {
    return null;
  }
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
