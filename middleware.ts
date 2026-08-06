import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

import { LEGACY_SESSION_COOKIE_NAME, REFRESH_COOKIE_NAME } from "@/lib/constants/app";
import { isLegacyWebFrozen, isNativeWebPath } from "@/lib/nav/legacy-web-freeze";
import { isPublicAppPath } from "@/lib/nav/public-app-path";

export function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (isLegacyWebFrozen() && !isNativeWebPath(pathname)) {
    const nativeAppURL = new URL("/ios", request.url);
    const verification = request.nextUrl.searchParams.get("verification");
    if (verification) nativeAppURL.searchParams.set("verification", verification);
    return NextResponse.redirect(nativeAppURL);
  }

  const sessionCookie =
    request.cookies.get(REFRESH_COOKIE_NAME)?.value ??
    request.cookies.get(LEGACY_SESSION_COOKIE_NAME)?.value;

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
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|icons/).*)"],
};
