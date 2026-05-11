/**
 * Normalizes user-pasted calendar URLs (e.g. webcal://) to https for fetch.
 */
export function normalizeCalendarSubscriptionUrl(raw: string): string {
  const t = raw.trim();
  const lower = t.toLowerCase();
  if (lower.startsWith("webcal://")) {
    return `https://${t.slice("webcal://".length)}`;
  }
  if (lower.startsWith("webcal:")) {
    const rest = t.slice("webcal:".length).replace(/^\/\//, "");
    return `https://${rest}`;
  }
  return t;
}

/**
 * Blocks obvious SSRF targets. Does not fully mitigate DNS rebinding.
 */
export function assertPublicHttpUrlForIcsFetch(urlString: string): URL {
  let u: URL;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error("Invalid calendar URL.");
  }
  if (u.protocol !== "http:" && u.protocol !== "https:") {
    throw new Error("Calendar URL must start with http(s) or webcal.");
  }
  const host = u.hostname.toLowerCase();
  if (
    host === "localhost" ||
    host === "0.0.0.0" ||
    host.endsWith(".localhost") ||
    host === "[::1]" ||
    host === "::1"
  ) {
    throw new Error("This calendar URL is not allowed.");
  }
  if (/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(host)) {
    throw new Error("This calendar URL is not allowed.");
  }
  return u;
}
