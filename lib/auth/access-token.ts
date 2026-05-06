import "server-only";

import { SignJWT, jwtVerify } from "jose";

import { ACCESS_TOKEN_TTL_MINUTES } from "@/lib/constants/app";

function accessSecretKey() {
  const raw = process.env.ACCESS_TOKEN_SECRET ?? process.env.SESSION_SECRET;
  if (raw && raw.length >= 16) {
    return new TextEncoder().encode(raw);
  }
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "Set ACCESS_TOKEN_SECRET (>= 16 chars), or SESSION_SECRET of sufficient length, for JWT access tokens.",
    );
  }
  return new TextEncoder().encode("dev-access-token-secret-min-32-chars!");
}

const alg = "HS256";

export async function signAccessToken(userId: string): Promise<{ token: string; expiresIn: number }> {
  const expiresIn = ACCESS_TOKEN_TTL_MINUTES * 60;
  const token = await new SignJWT({ typ: "access" })
    .setProtectedHeader({ alg })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TOKEN_TTL_MINUTES}m`)
    .sign(accessSecretKey());
  return { token, expiresIn };
}

/** @returns user id (sub) or null if invalid / expired */
export async function verifyAccessToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, accessSecretKey(), { algorithms: [alg] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}
