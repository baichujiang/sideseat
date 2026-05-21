/**
 * Shared helpers for "Back" navigation and `?returnTo=` handling.
 *
 * Rules:
 *  - A safe return path MUST start with `/` and MUST NOT start with `//`
 *  - When `returnTo` is missing, unsafe, or would return to the current page,
 *    callers supply a logical fallback (e.g. `/inbox` for chat threads).
 *  - Tab roots (`/home`, `/inbox`, `/discover`, `/courses`, `/profile`) never
 *    show a back button; they rely on the bottom tab bar.
 */

const BLOCKED_BACK_PATH_PREFIXES = [
  "/login",
  "/signup",
  "/onboarding",
  "/share/view",
  "/share/schedule",
] as const;

/** Returns `raw` if it is a safe same-origin path, otherwise `fallback`. */
export function safeReturnPath(raw: string | null | undefined, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  return trimmed;
}

function decodeReturnPathOnce(path: string): string {
  if (!path.includes("%")) return path;
  try {
    const decoded = decodeURIComponent(path);
    if (decoded.startsWith("/") && !decoded.startsWith("//")) return decoded;
  } catch {
    /* keep original */
  }
  return path;
}

export function backTargetPathname(path: string): string {
  const noHash = path.split("#")[0] ?? path;
  return (noHash.split("?")[0] ?? noHash) || path;
}

export function isBlockedBackTarget(pathname: string): boolean {
  if (pathname === "/") return true;
  return BLOCKED_BACK_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Pick the href for BackLink: honor `returnTo` when safe, else `fallback`.
 * When `currentPathname` is set, never return the page the user is already on.
 */
export function resolveBackHref(
  returnTo: string | null | undefined,
  fallback: string,
  currentPathname?: string | null,
): string {
  const safeFallback = safeReturnPath(fallback, "/home");
  let candidate = decodeReturnPathOnce(safeReturnPath(returnTo, safeFallback));

  const candidatePath = backTargetPathname(candidate);
  if (currentPathname && candidatePath === currentPathname) {
    candidate = safeFallback;
  }
  if (isBlockedBackTarget(candidatePath)) {
    candidate = safeFallback;
  }
  return candidate;
}

/**
 * Build a `?returnTo=<current>` query suffix for propagating the current
 * location into a child route.
 */
export function withReturnTo(href: string, current: string | null | undefined): string {
  if (!current) return href;
  const safe = safeReturnPath(current, "");
  if (!safe) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}returnTo=${encodeURIComponent(safe)}`;
}

/** Full path + search + hash for the current location (client-only). */
export function currentAppLocation(pathname: string, search: string, hash: string): string {
  return `${pathname}${search}${hash}`;
}
