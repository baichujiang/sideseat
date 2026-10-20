import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getTimePoll, TimePollError, type TimePollActor } from "@/lib/api/v1/time-poll-service";
import { consumeV1RateLimit, getV1ClientIp, rateLimitSubject } from "@/lib/api/v1/rate-limit";
import { lockPollPlan } from "@/lib/time-polls/planning";
import { timePollPhase } from "@/lib/time-polls/lifecycle";

export const pollGuestCookie = "sideseat_poll_guest";
export const pollGuestCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/public/time-polls", maxAge: 180 * 86400 };
export const pollParticipantCookie = "sideseat_poll_participant";
export const pollParticipantCookieOptions = (token: string) => ({ ...pollGuestCookieOptions, path: `/api/public/time-polls/${token}` });
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
  // Link holders may resume a guest by name. This poll-scoped cookie remembers
  // their selection; old random browser credentials still work on return.
  const selected = (await cookies()).get(pollParticipantCookie)?.value;
  const secret = await readCredential();
  const guest = selected
    ? await prisma.timePollGuest.findFirst({ where: { id: selected, poll: { token } } })
    : secret ? await prisma.timePollGuest.findFirst({ where: { credentialHash: digest(secret), poll: { token } } }) : null;
  if (participantId !== undefined && (!guest || guest.id !== participantId)) throw new TimePollError(401, "Your participant session changed. Reload this page before editing.");
  return guest;
}

export async function publicPollData(token: string, appOrigin: string) {
  const guest = await publicPollGuest(token);
  const actor: TimePollActor | null = guest ? { guestId: guest.id } : null;
  return { ...await getTimePoll(token, actor, appOrigin), viewerId: guest?.id ?? null };
}

export async function joinPublicPoll(token: string, displayName: string, appOrigin: string) {
  const { guest, resumed } = await prisma.$transaction(async (tx) => {
    const poll = await lockPollPlan(tx, token, null);
    if (!poll) throw new TimePollError(404, "Plan unavailable.");
    if (!["COLLECTING", "INVITING"].includes(timePollPhase(poll)) && !(poll.phase === "CONFIRMED" && poll.chosenStart && poll.chosenStart > new Date())) throw new TimePollError(409, "This plan is no longer open to new participants.");
    const existing = await tx.timePollGuest.findFirst({
      where: { pollId: poll.id, displayName: { equals: displayName, mode: "insensitive" } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    const guest = existing ?? await tx.timePollGuest.create({ data: { pollId: poll.id, credentialHash: digest(randomBytes(32).toString("base64url")), displayName } });
    return { guest, resumed: Boolean(existing) };
  });
  return { participantId: guest.id, data: { ...await getTimePoll(token, { guestId: guest.id }, appOrigin), viewerId: guest.id, resumed } };
}
