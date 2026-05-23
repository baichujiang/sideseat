import { signAccessToken } from "@/lib/auth/access-token";
import { ensureAssistantBotConnection } from "@/lib/auth/assistant-bot";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";
import { createHash } from "crypto";
import { cookies } from "next/headers";

import {
  LEGACY_SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
} from "@/lib/constants/app";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Exchange refresh cookie for a new in-memory access JWT.
 * App startup calls this with credentials; 401 → client should send user to login.
 */
export async function POST() {
  try {
    const cookieStore = await cookies();
    const raw =
      cookieStore.get(REFRESH_COOKIE_NAME)?.value ?? cookieStore.get(LEGACY_SESSION_COOKIE_NAME)?.value ?? null;

    if (!raw) {
      return error("Not authenticated.", 401);
    }

    const session = await prisma.session.findUnique({
      where: { tokenHash: hashToken(raw) },
      include: { user: true },
    });

    if (!session || session.expiresAt < new Date()) {
      cookieStore.delete(REFRESH_COOKIE_NAME);
      cookieStore.delete(LEGACY_SESSION_COOKIE_NAME);
      if (session) {
        await prisma.session.deleteMany({ where: { id: session.id } });
      }
      return error("Session expired.", 401);
    }

    await ensureAssistantBotConnection(session.userId);
    const { token: accessToken, expiresIn } = await signAccessToken(session.userId);
    return ok({
      accessToken,
      expiresIn,
      userId: session.userId,
      onboardingComplete: session.user.onboardingComplete,
      isGuest: session.user.isGuest,
    });
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("POST /api/auth/refresh");
      return error(
        "Cannot connect to the database. Check DATABASE_URL and that your Neon project is awake.",
        503,
      );
    }
    console.error(cause);
    throw cause;
  }
}
