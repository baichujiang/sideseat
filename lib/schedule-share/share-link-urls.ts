/** Owner settings screen (by-token edit while link is active). */
export function scheduleShareOwnerEditPath(token: string): string {
  return `/share/schedule/${encodeURIComponent(token)}`;
}

/** Read-only calendar for recipients (generated link opens here). */
export function scheduleShareRecipientViewPath(token: string): string {
  return `/share/view/${encodeURIComponent(token)}`;
}

/** Recipient view with optional `?returnTo=` (e.g. back to a chat thread). */
export function scheduleShareRecipientViewHref(
  token: string,
  options?: { returnTo?: string | null },
): string {
  const base = scheduleShareRecipientViewPath(token);
  const returnTo = options?.returnTo?.trim();
  if (!returnTo || !returnTo.startsWith("/") || returnTo.startsWith("//")) return base;
  return `${base}?returnTo=${encodeURIComponent(returnTo)}`;
}

export function scheduleShareRecipientViewUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${scheduleShareRecipientViewPath(token)}`;
}

export function scheduleShareOwnerEditUrl(origin: string, token: string): string {
  return `${origin.replace(/\/$/, "")}${scheduleShareOwnerEditPath(token)}`;
}

export function plainTokenFromScheduleShareRecipientUrl(shareUrl: string): string | null {
  try {
    const match = new URL(shareUrl).pathname.match(/^\/share\/view\/(.+)$/);
    return match ? decodeURIComponent(match[1]) : null;
  } catch {
    const match = shareUrl.match(/\/share\/view\/([^?#]+)/);
    return match ? decodeURIComponent(match[1]) : null;
  }
}

/** Path from a stored or pasted share URL (recipient or legacy owner URL). */
export function pathFromScheduleShareUrl(shareUrl: string): string {
  const token = plainTokenFromScheduleShareRecipientUrl(shareUrl);
  if (token) return scheduleShareRecipientViewPath(token);
  try {
    return new URL(shareUrl).pathname;
  } catch {
    const edit = shareUrl.match(/\/share\/schedule\/[^?#]+/);
    return edit?.[0] ?? "/home";
  }
}

/** After creating a link, the owner opens the edit screen (not the recipient view). */
export function scheduleShareOwnerEditPathFromRecipientUrl(shareUrl: string): string {
  const token = plainTokenFromScheduleShareRecipientUrl(shareUrl);
  return token ? scheduleShareOwnerEditPath(token) : pathFromScheduleShareUrl(shareUrl);
}
