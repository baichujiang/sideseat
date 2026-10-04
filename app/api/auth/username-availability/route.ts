import { NextResponse } from "next/server";
import { z } from "zod";
import { isUsernameAvailable } from "@/lib/auth/username-availability";
import { loginUsernameField, LOGIN_USERNAME_MESSAGES_EN } from "@/lib/validators/auth";
import { consumeV1RateLimit, getV1ClientIp, rateLimitHeaders, rateLimitSubject } from "@/lib/api/v1/rate-limit";

const schema = z.object({ username: loginUsernameField(LOGIN_USERNAME_MESSAGES_EN) });
const headers = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, code: "INVALID_USERNAME", error: "Enter a valid username." }, { status: 422, headers });
  }
  try {
    const limit = await consumeV1RateLimit({
      scope: "username-availability", subject: rateLimitSubject(getV1ClientIp(request)),
      limit: 60, windowMs: 60_000,
    });
    if (!limit.allowed) {
      return NextResponse.json({ success: false, code: "RATE_LIMITED", error: "Please wait before checking again." }, {
        status: 429, headers: { ...headers, ...rateLimitHeaders(limit) },
      });
    }
    const username = parsed.data.username;
    return NextResponse.json({ success: true, data: { username, available: await isUsernameAvailable(username) } }, { headers });
  } catch {
    return NextResponse.json({ success: false, code: "CHECK_UNAVAILABLE", error: "Unable to check the username right now." }, { status: 503, headers });
  }
}
