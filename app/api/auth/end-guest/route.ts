import { NextResponse, type NextRequest } from "next/server";

import { destroySession, getSessionUser } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const url = new URL(request.url);
  const rawTarget = url.searchParams.get("to") ?? "signup";
  const target = rawTarget === "login" ? "/login" : "/signup";

  const user = await getSessionUser();
  if (user?.isGuest) {
    await destroySession();
  }

  return NextResponse.redirect(new URL(target, request.url), { status: 303 });
}
