import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getTimePoll, TimePollError, type TimePollActor } from "@/lib/api/v1/time-poll-service";
import { consumeV1RateLimit, getV1ClientIp, rateLimitSubject } from "@/lib/api/v1/rate-limit";

export const pollGuestCookie = "sideseat_poll_guest";
export const pollGuestCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/public/time-polls", maxAge: 180 * 86400 };
export const guestParticipantSchema = z.object({ participantId: z.string().cuid() });
const digest = (secret: string) => createHash("sha256").update(secret).digest("hex");

export async function publicPollGuard(request: Request, token: string, write = false, joining = false) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new TimePollError(404, "Plan unavailable.");
  if (write && request.headers.get("origin") && request.headers.get("origin") !== `${request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1)}://${request.headers.get("x-forwarded-host") ?? request.headers.get("host")}`) {
    throw new TimePollError(403, "Open this shared link directly to make changes.");
  }
  const limit = await consumeV1RateLimit({ scope: joining ? "poll-guest-join" : write ? "poll-guest-write" : "poll-guest-read", subject: rateLimitSubject(`${token}:${getV1ClientIp(request)}`), limit: joining ? 40 : write ? 120 : 240, windowMs: joining ? 3600000 : 60000 });
  if (!limit.allowed) throw new TimePollError(429, "Too many requests. Please try again shortly.");
}

async function readCredential() {
  const value = (await cookies()).get(pollGuestCookie)?.value;
  return value && /^[A-Za-z0-9_-]{43}$/.test(value) ? value : null;
}

export async function publicPollGuest(token: string, participantId?: string) {
  const secret = await readCredential();
  const guest = secret ? await prisma.timePollGuest.findFirst({ where: { credentialHash: digest(secret), poll: { token } } }) : null;
  if (participantId !== undefined && (!guest || guest.id !== participantId)) throw new TimePollError(401, "Your participant session changed. Reload this page before editing.");
  return guest;
}

export async function publicPollData(token: string, appOrigin: string) {
  const guest = await publicPollGuest(token);
  const actor: TimePollActor | null = guest ? { guestId: guest.id } : null;
  return { ...await getTimePoll(token, actor, appOrigin), viewerId: guest?.id ?? null };
}

export async function joinPublicPoll(token: string, displayName: string, appOrigin: string) {
  const poll = await getTimePoll(token, null, appOrigin);
  if (!["COLLECTING", "INVITING"].includes(poll.phase)) throw new TimePollError(409, "This plan is no longer open to new participants.");
  const secret = await readCredential() ?? randomBytes(32).toString("base64url");
  const root = await prisma.timePoll.findUniqueOrThrow({ where: { token }, select: { id: true } });
  const guest = await prisma.timePollGuest.upsert({ where: { pollId_credentialHash: { pollId: root.id, credentialHash: digest(secret) } }, create: { pollId: root.id, credentialHash: digest(secret), displayName }, update: {} });
  return { secret, data: { ...await getTimePoll(token, { guestId: guest.id }, appOrigin), viewerId: guest.id } };
}
