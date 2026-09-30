import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const LINK_TTL_SECONDS = 60 * 60;

function signingKey() {
  const value = process.env.SESSION_SECRET;
  if (value && value.length >= 16) return value;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET is required for private media.");
  return "sideseat-local-media-only-secret";
}

function signature(connectionId: string, messageId: string, viewerId: string, expires: number) {
  return createHmac("sha256", signingKey())
    .update(JSON.stringify(["chat-image-v1", connectionId, messageId, viewerId, expires]))
    .digest("base64url");
}

/** Grants are issued only from an authenticated conversation/inbox response. */
export function chatImageReadUrl(connectionId: string, messageId: string, viewerId: string, now = Date.now()) {
  const expires = Math.floor(now / 1000) + LINK_TTL_SECONDS;
  const origin = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const url = new URL(`/api/connections/${encodeURIComponent(connectionId)}/messages/${encodeURIComponent(messageId)}/image`, origin);
  url.searchParams.set("viewer", viewerId);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature(connectionId, messageId, viewerId, expires));
  return url.toString();
}

export function verifyChatImageGrant(url: URL, connectionId: string, messageId: string, now = Date.now()) {
  const viewerId = url.searchParams.get("viewer");
  const expires = Number(url.searchParams.get("expires"));
  const supplied = url.searchParams.get("signature");
  const seconds = Math.floor(now / 1000);
  if (!viewerId || !supplied || !Number.isSafeInteger(expires) || expires <= seconds || expires > seconds + LINK_TTL_SECONDS) return null;
  const expected = Buffer.from(signature(connectionId, messageId, viewerId, expires));
  const actual = Buffer.from(supplied);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  return viewerId;
}
