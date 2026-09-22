import "server-only";

import type { User } from "@prisma/client";

import { getSessionUser } from "@/lib/auth/session";
import { v1Error } from "@/lib/api/v1/http";

export async function requireV1User(
  request: Request,
): Promise<{ ok: true; user: User } | { ok: false; response: ReturnType<typeof v1Error> }> {
  const user = await getSessionUser();
  if (!user || user.isGuest) {
    return {
      ok: false,
      response: v1Error(request, {
        code: "AUTHENTICATION_REQUIRED",
        message: "Sign in is required.",
        status: 401,
      }),
    };
  }
  if (!user.onboardingComplete) {
    return {
      ok: false,
      response: v1Error(request, {
        code: "ACCOUNT_UNAVAILABLE",
        message: "Complete account setup before using this feature.",
        status: 403,
      }),
    };
  }
  return { ok: true, user };
}
