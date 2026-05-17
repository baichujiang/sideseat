/**
 * Paths reachable without a refresh session cookie (aligns with `middleware.ts`).
 * Used by client auth bootstrap to avoid redirect loops on auth screens.
 */
export function isPublicAppPath(pathname: string): boolean {
  if (
    pathname === "/manifest.webmanifest" ||
    pathname === "/sw.js" ||
    pathname.startsWith("/icons/")
  ) {
    return true;
  }
  if (
    pathname === "/" ||
    pathname === "/home" ||
    pathname === "/discover" ||
    pathname.startsWith("/discover/") ||
    pathname === "/courses" ||
    pathname.startsWith("/courses/") ||
    pathname === "/forgot-password"
  ) {
    return true;
  }
  if (pathname === "/profile") {
    return true;
  }
  if (pathname === "/inbox" || pathname.startsWith("/inbox/")) {
    return true;
  }
  if (pathname === "/login" || pathname.startsWith("/login/")) {
    return true;
  }
  if (pathname === "/signup" || pathname.startsWith("/signup/")) {
    return true;
  }
  if (pathname === "/share/schedule" || pathname.startsWith("/share/schedule/")) {
    return true;
  }
  return false;
}
