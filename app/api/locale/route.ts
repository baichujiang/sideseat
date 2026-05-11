import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { z } from "zod";

import { APP_LOCALE_COOKIE } from "@/lib/i18n/app-locale";

const bodySchema = z.object({
  locale: z.enum(["en", "zh-CN"]),
});

export async function POST(request: Request) {
  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ success: false as const, error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ success: false as const, error: "Invalid locale" }, { status: 400 });
  }

  const jar = await cookies();
  jar.set(APP_LOCALE_COOKIE, parsed.data.locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ success: true as const });
}
