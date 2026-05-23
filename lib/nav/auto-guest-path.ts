import { isPublicAppPath } from "@/lib/nav/public-app-path";

/** Tab and browse routes that auto-start a guest session when there is no cookie. */
export function shouldAutoGuestSession(pathname: string): boolean {
  if (
    pathname.startsWith("/login") ||
    pathname.startsWith("/signup") ||
    pathname.startsWith("/forgot-password") ||
    pathname.startsWith("/admin")
  ) {
    return false;
  }
  if (pathname.startsWith("/share/")) return false;
  return isPublicAppPath(pathname);
}
