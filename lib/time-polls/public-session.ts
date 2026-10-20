import "server-only";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { getTimePoll, TimePollError, type TimePollActor } from "@/lib/api/v1/time-poll-service";
import { consumeV1RateLimit, getV1ClientIp, rateLimitSubject } from "@/lib/api/v1/rate-limit";
import { lockPollPlan } from "@/lib/time-polls/planning";
import { timePollPhase } from "@/lib/time-polls/lifecycle";
import { guestDigest, guestSecret, securedGuestHash, parseGuestCredential, matchesGuestSecret, guestRecoveryUrl } from "@/lib/time-polls/guest-credentials";

export const pollGuestCookie = "sideseat_poll_guest";
export const pollGuestCookieOptions = { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax" as const, path: "/api/public/time-polls", maxAge: 180 * 86400 };
export const pollParticipantCookie = "sideseat_poll_participant";
export const pollParticipantCookieOptions = (token: string) => ({ ...pollGuestCookieOptions, path: `/api/public/time-polls/${token}` });
export const pollAccessCookie = "sideseat_poll_access_v2";
export const guestParticipantSchema = z.object({ participantId: z.string().cuid() });

export async function publicPollGuard(request: Request, token: string, write = false, joining = false) {
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) throw new TimePollError(404, "Plan unavailable.");
  if (write && request.headers.get("origin") && request.headers.get("origin") !== `${request.headers.get("x-forwarded-proto") ?? new URL(request.url).protocol.slice(0, -1)}://${request.headers.get("x-forwarded-host") ?? request.headers.get("host")}`) {
    throw new TimePollError(403, "Open this shared link directly to make changes.");
  }
  const limit = await consumeV1RateLimit({ scope: joining ? "poll-guest-join" : write ? "poll-guest-write" : "poll-guest-read", subject: rateLimitSubject(`${token}:${getV1ClientIp(request)}`), limit: joining ? 40 : write ? 120 : 240, windowMs: joining ? 3600000 : 60000 });
  if (!limit.allowed) throw new TimePollError(429, "Too many requests. Please try again shortly.");
}

async function rememberGuest(token: string, id: string, secret: string) {
  const jar = await cookies();
  jar.set(pollAccessCookie, `${id}.${secret}`, pollParticipantCookieOptions(token));
  jar.set(pollParticipantCookie, "", { ...pollParticipantCookieOptions(token), maxAge: 0 });
}

export async function publicPollGuest(token: string, participantId?: string) {
  const jar = await cookies();
  const access = jar.get(pollAccessCookie)?.value;
  const credential = parseGuestCredential(access);
  let guest = credential ? await prisma.timePollGuest.findFirst({ where: { id: credential.id, poll: { token } } }) : null;
  if (guest && !matchesGuestSecret(guest.credentialHash, credential!.secret)) guest = null;
  // Only the original random secret proves a legacy browser's ownership.
  // A former participant-ID cookie (or matching name) grants no access.
  if (!access) {
    const legacy = jar.get(pollGuestCookie)?.value;
    if (legacy && /^[A-Za-z0-9_-]{43}$/.test(legacy)) {
      const old = await prisma.timePollGuest.findFirst({ where: { credentialHash: guestDigest(legacy), poll: { token } } });
      if (old) {
        const secret = guestSecret();
        const updated = await prisma.timePollGuest.updateMany({ where: { id: old.id, credentialHash: old.credentialHash }, data: { credentialHash: securedGuestHash(secret) } });
        if (updated.count) { await rememberGuest(token, old.id, secret); guest = old; }
      }
    }
  }
  if (participantId !== undefined && (!guest || guest.id !== participantId)) throw new TimePollError(401, "Your participant session changed. Reload this page before editing.");
  return guest;
}

export async function publicPollData(token: string, appOrigin: string) {
  const guest = await publicPollGuest(token);
  const actor: TimePollActor | null = guest ? { guestId: guest.id } : null;
  return { ...await getTimePoll(token, actor, appOrigin), viewerId: guest?.id ?? null,
    legacyGuestNeedsRecovery: !guest && Boolean((await cookies()).get(pollParticipantCookie)?.value) };
}

export async function joinPublicPoll(token: string, displayName: string, appOrigin: string, newParticipant = false) {
  const current = await publicPollGuest(token);
  if (current && !newParticipant) return { ...await publicPollData(token, appOrigin), resumed: true };
  const secret = guestSecret();
  const guest = await prisma.$transaction(async (tx) => {
    const poll = await lockPollPlan(tx, token, null);
    if (!poll) throw new TimePollError(404, "Plan unavailable.");
    if (!["COLLECTING", "INVITING"].includes(timePollPhase(poll)) && !(poll.phase === "CONFIRMED" && poll.chosenStart && poll.chosenStart > new Date())) throw new TimePollError(409, "This plan is no longer open to new participants.");
    return tx.timePollGuest.create({ data: { pollId: poll.id, credentialHash: securedGuestHash(secret), displayName } });
  });
  await rememberGuest(token, guest.id, secret);
  return { ...await publicPollData(token, appOrigin), resumed: false };
}

export async function recoverPublicPollGuest(token: string, value: string, appOrigin: string) {
  const credential = parseGuestCredential(value);
  const guest = credential ? await prisma.timePollGuest.findFirst({ where: { id: credential.id, poll: { token } } }) : null;
  if (!guest || !credential || (!matchesGuestSecret(guest.credentialHash, credential.secret) && !matchesGuestSecret(guest.credentialHash, credential.secret, true))) {
    throw new TimePollError(401, "This recovery link is invalid or has been replaced. Use your personal recovery link.");
  }
  if (guest.credentialHash.startsWith("pending-v2:")) {
    const claimed = await prisma.timePollGuest.updateMany({ where: { id: guest.id, credentialHash: guest.credentialHash }, data: { credentialHash: securedGuestHash(credential.secret) } });
    if (!claimed.count) throw new TimePollError(401, "This recovery link is invalid or has been replaced. Use your personal recovery link.");
  }
  await rememberGuest(token, guest.id, credential.secret);
  return { ...await publicPollData(token, appOrigin), resumed: true };
}

export async function publicPollRecoveryLink(token: string, participantId: string, appOrigin: string) {
  const guest = await publicPollGuest(token, participantId);
  const value = (await cookies()).get(pollAccessCookie)?.value;
  if (!guest || !parseGuestCredential(value)) throw new TimePollError(401, "Use your personal recovery link to restore your response.");
  return { recoveryUrl: guestRecoveryUrl(token, value!, appOrigin) };
}
