import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { SESSION_COOKIE_NAME, authRoutes } from "@/lib/constants/app";

/**
 * Paths reachable without a session cookie. Product choice: first-time visitors
 * land in the real app chrome (tabs) instead of a full-screen login wall.
 *
 * - Tab roots: `/home`, `/discover`, `/courses`, `/inbox` (+ `/inbox/*`)
 * - Me tab root only: `/profile` exact — `/profile/blocked`, `/profile/edit`, …
 *   still require auth.
 * - Auth pages: `/login`, `/signup` (+ subpaths if any)
 */
function isPublicAppPath(pathname: string): boolean {
  /** PWA: manifest, SW, and generated icons must not redirect to login. */
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
  return false;
}

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME)?.value;

  if (!isPublicAppPath(pathname) && !sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    const back = `${pathname}${request.nextUrl.search}`;
    loginUrl.searchParams.set("returnTo", back);
    return NextResponse.redirect(loginUrl);
  }

  // Signed-in users are sent away from auth screens in each page's RSC (login/signup).
  // Guest sessions also carry a session cookie — they must still reach /login and /signup.

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
