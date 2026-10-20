import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export const guestCredentialSchema = z.string().regex(/^c[a-z0-9]+\.[A-Za-z0-9_-]{43}$/).max(100);
export const guestSecret = () => randomBytes(32).toString("base64url");
export const guestDigest = (secret: string) => createHash("sha256").update(secret).digest("hex");
export const securedGuestHash = (secret: string) => `v2:${guestDigest(secret)}`;
export const pendingGuestHash = (secret: string) => `pending-v2:${guestDigest(secret)}`;
export function matchesGuestSecret(hash: string, secret: string, pending = false) {
  const expected = pending ? pendingGuestHash(secret) : securedGuestHash(secret);
  return hash.length === expected.length && timingSafeEqual(Buffer.from(hash), Buffer.from(expected));
}
export function parseGuestCredential(value: string | undefined) {
  if (!guestCredentialSchema.safeParse(value).success) return null;
  const [id, secret] = value!.split(".");
  return { id, secret };
}
export function guestRecoveryUrl(token: string, credential: string, origin: string) {
  // A distinct web-only path also works with already-cached iPhone association
  // rules for /time-polls/*, so installed apps cannot swallow a guest's key.
  const url = new URL(`/time-poll-recovery/${token}`, origin);
  // The private key stays out of request URLs, referrers and server access logs.
  url.hash = `recover=${credential}`;
  return url.toString();
}
