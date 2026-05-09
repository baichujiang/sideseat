import { safeReturnPath } from "@/lib/nav/back";

const TAB_ROOTS = new Set(["/home", "/courses", "/discover", "/inbox", "/profile"]);

export function isTabRootPath(pathname: string): boolean {
  return TAB_ROOTS.has(pathname);
}

/**
 * Semantic parent for edge-swipe when `returnTo` is missing or invalid.
 * `undefined` = no dedicated parent (caller may fall back to `router.back()`).
 */
export function drillInFallback(pathname: string): string | undefined {
  if (pathname.startsWith("/connections/")) return "/inbox";
  if (pathname.startsWith("/groups/") && pathname.endsWith("/info")) {
    const m = /^\/groups\/([^/]+)\/info$/.exec(pathname);
    return m ? `/groups/${m[1]}` : "/inbox";
  }
  if (pathname.startsWith("/groups/")) return "/inbox";
  if (pathname.startsWith("/users/")) return "/discover";
  if (/^\/courses\/[^/]+\/chat$/.test(pathname)) {
    const m = /^\/courses\/([^/]+)\/chat$/.exec(pathname);
    return m ? `/courses/${m[1]}` : "/courses";
  }
  if (/^\/courses\/[^/]+$/.test(pathname)) return "/courses";
  if (pathname.startsWith("/discover/posts/")) return "/discover";
  if (pathname === "/courses/add") return "/courses";
  if (pathname.startsWith("/inbox/")) return "/inbox";
  if (pathname.startsWith("/profile/")) return "/profile";
  if (pathname === "/settings") return "/profile";
  if (pathname.startsWith("/admin")) return "/home";
  return undefined;
}

/**
 * Edge-swipe destination: safe `returnTo` wins, else drill-in fallback.
 * `null` — no semantic target (caller: `router.back()` after ruling out tab roots).
 */
export function resolveSwipeBackHref(
  pathname: string,
  searchParams: { get: (key: string) => string | null },
): string | null {
  const fallback = drillInFallback(pathname);
  if (fallback === undefined) {
    return null;
  }

  const rawReturn = searchParams.get("returnTo");
  if (rawReturn) {
    const safe = safeReturnPath(rawReturn, fallback);
    if (safe !== pathname) {
      return safe;
    }
  }

  return fallback;
}
