import "server-only";

import { cache } from "react";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes } from "crypto";
import { addDays } from "date-fns";

import { signAccessToken, verifyAccessToken } from "@/lib/auth/access-token";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import {
  LEGACY_SESSION_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  REFRESH_TOKEN_TTL_DAYS,
} from "@/lib/constants/app";

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function readRefreshRaw(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  return (
    cookieStore.get(REFRESH_COOKIE_NAME)?.value ?? cookieStore.get(LEGACY_SESSION_COOKIE_NAME)?.value ?? null
  );
}

async function getUserFromRefreshCookie() {
  const cookieStore = await cookies();
  const token = readRefreshRaw(cookieStore);

  if (!token) {
    return null;
  }

  const session = await prisma.session.findUnique({
    where: {
      tokenHash: hashToken(token),
    },
    include: {
      user: true,
    },
  });

  if (!session || session.expiresAt < new Date()) {
    if (session) {
      await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => {
        /* ignore */
      });
    }
    try {
      cookieStore.delete(REFRESH_COOKIE_NAME);
      cookieStore.delete(LEGACY_SESSION_COOKIE_NAME);
    } catch {
      /* RSC may forbid mutation */
    }
    return null;
  }

  return session.user;
}

/**
 * Creates a refresh session (DB + HttpOnly cookie) and returns a short-lived access JWT
 * for the client to hold in memory only.
 */
export async function createSession(userId: string) {
  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = hashToken(rawToken);
  const expiresAt = addDays(new Date(), REFRESH_TOKEN_TTL_DAYS);

  await prisma.session.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });

  const cookieStore = await cookies();
  cookieStore.set(REFRESH_COOKIE_NAME, rawToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
  cookieStore.delete(LEGACY_SESSION_COOKIE_NAME);

  const { token: accessToken, expiresIn } = await signAccessToken(userId);
  return { accessToken, expiresIn };
}

/** Signs out other devices; keeps the refresh cookie used for this request when present. */
export async function revokeOtherSessions(userId: string) {
  const cookieStore = await cookies();
  const token = readRefreshRaw(cookieStore);
  const currentHash = token ? hashToken(token) : null;

  await prisma.session.deleteMany({
    where: currentHash
      ? { userId, tokenHash: { not: currentHash } }
      : { userId },
  });
}

export async function destroySession() {
  const cookieStore = await cookies();
  const token = readRefreshRaw(cookieStore);

  if (token) {
    await prisma.session.deleteMany({
      where: {
        tokenHash: hashToken(token),
      },
    });
  }

  cookieStore.delete(REFRESH_COOKIE_NAME);
  cookieStore.delete(LEGACY_SESSION_COOKIE_NAME);
}

export const getSessionUser = cache(async function getSessionUser() {
  try {
    const headerList = await headers();
    const auth = headerList.get("authorization");
    if (auth?.startsWith("Bearer ")) {
      const sub = await verifyAccessToken(auth.slice(7).trim());
      if (sub) {
        const user = await prisma.user.findUnique({ where: { id: sub } });
        if (user) {
          return user;
        }
      }
      // An explicit bearer credential is authoritative. Never silently fall
      // back to a cookie from another account when the token is invalid.
      return null;
    }

    const fromCookie = await getUserFromRefreshCookie();
    if (fromCookie) {
      return fromCookie;
    }

    return null;
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("getSessionUser");
      return null;
    }
    throw cause;
  }
});

export async function requireUser() {
  const user = await getSessionUser();

  if (!user) {
    redirect("/login");
  }

  return user;
}
