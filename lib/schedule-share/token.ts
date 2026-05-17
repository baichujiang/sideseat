import { createHash, randomBytes } from "crypto";

/** Encode bytes as URL-safe base64 without padding. */
function base64UrlEncode(buffer: Buffer): string {
  return buffer
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Plain token shown once to the owner — never log this value. */
export function generateScheduleShareToken(): string {
  return base64UrlEncode(randomBytes(32));
}

/** Persist-only SHA-256 hex of plaintext token. */
export function hashScheduleShareToken(plaintext: string): string {
  return createHash("sha256").update(plaintext, "utf8").digest("hex");
}
