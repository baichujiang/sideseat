import "server-only";
import { randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { withCanonicalConnectionScope } from "@/lib/connections/canonical-connection";
import { createDirectMessageRecord } from "@/lib/chat/direct-message-service";
import { claimIdempotency, completeIdempotency, hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { SIGNUP_DEFAULT_PROFILE, defaultNicknameFromUsername } from "@/lib/auth/signup-defaults";
import { guestNicknameFields, validateNicknameForUser } from "@/lib/auth/nickname-fields";
import { hashPassword } from "@/lib/auth/password";
import { validSharedTimeSelection, type SharedTimeSelection } from "./time-selection";

export class IntentShareError extends Error {
  constructor(readonly status: number, message: string, readonly code?: string) { super(message); }
}
const unavailable = () => new IntentShareError(404, "This shared intention is no longer available.");
export type SharedPlan = {
  id: string; title: string; location: string | null; note: string | null;
  startAt: string; endAt: string; status: string; canAccept: boolean;
};
export type SharedConversation = {
  state: "NEW" | "OWNER" | "WAITING" | "CONNECTED";
  connectionId?: string;
  messages: { id: string; mine: boolean; body: string | null; type: string; createdAt: string; plan?: SharedPlan | null }[];
};
const select = { id: true, userId: true, shareToken: true, topic: true, activityText: true,
  studyGoal: true, sportTag: true, sportOtherNote: true, togetherMode: true, note: true,
  timeWindows: true, timePreference: true, timeZone: true, expiresAt: true, status: true, version: true,
  user: { select: { nickname: true, username: true } } } satisfies Prisma.WeeklyIntentSelect;
const available = (token: string): Prisma.WeeklyIntentWhereInput => ({ shareToken: token, status: "ACTIVE",
  exploreResponseToId: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
  user: { isGuest: false, moderationBlocks: { none: { isActive: true } } } });

// Ending discovery (including automatic completion after accepting a Plan) must
// not strand the people already chatting. The cookie must identify a participant
// in this intention's established conversation; a revoked share token still stops access.
function readable(token: string, viewerId?: string): Prisma.WeeklyIntentWhereInput {
  if (!viewerId) return available(token);
  const participant = { status: "MUTUAL" as const,
    OR: [{ userAId: viewerId }, { userBId: viewerId }],
    connection: { is: { status: "ACTIVE" as const } } };
  return { shareToken: token, exploreResponseToId: null,
    user: { isGuest: false, moderationBlocks: { none: { isActive: true } } },
    OR: [available(token), { mutualOpportunitiesAsA: { some: participant } }, { mutualOpportunitiesAsB: { some: participant } }] };
}

export async function publicIntention(token: string, viewerId?: string) {
  if (!/^[a-f0-9]{48}$/.test(token)) return null;
  const row = await prisma.weeklyIntent.findFirst({ where: readable(token, viewerId), select });
  if (!row) return null;
  return { title: row.activityText || row.studyGoal || row.sportOtherNote || row.sportTag || row.topic,
    host: row.user.nickname || row.user.username, topic: row.topic, note: row.note, version: row.version,
    timeWindows: row.timeWindows as { startAt: string; endAt: string }[],
    timePreference: row.timePreference as { kind: string; startDate?: string; endDate?: string; period?: string } | null,
    timeZone: row.timeZone, acceptingContacts: row.status === "ACTIVE" && (!row.expiresAt || row.expiresAt > new Date()) };
}
export type SharedIntention = NonNullable<Awaited<ReturnType<typeof publicIntention>>>;

export async function enableIntentionShare(userId: string, intentId: string) {
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "WeeklyIntent" WHERE "id" = ${intentId} FOR UPDATE`;
    const row = await tx.weeklyIntent.findFirst({ where: { id: intentId, userId, status: "ACTIVE",
      exploreResponseToId: null, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] } });
    if (!row) throw unavailable();
    if (row.shareToken) return row.shareToken;
    return (await tx.weeklyIntent.update({ where: { id: row.id }, data: { shareToken: randomBytes(24).toString("hex") } })).shareToken!;
  });
}

export async function createShareGuest() {
  return prisma.user.create({ data: { ...SIGNUP_DEFAULT_PROFILE,
    username: `guest_${randomBytes(12).toString("hex")}`, ...guestNicknameFields(), isGuest: true,
    hashedPassword: await hashPassword(randomBytes(32).toString("hex")),
    onboardingComplete: true, hideFromDiscovery: true, hideFromRecommendations: true,
  } });
}

async function pairAllowed(tx: Prisma.TransactionClient, viewerId: string, ownerId: string) {
  if (viewerId === ownerId) throw new IntentShareError(409, "This is your own intention.");
  const [blocked, moderated] = await Promise.all([
    tx.block.count({ where: { OR: [{ blockerId: viewerId, blockedId: ownerId }, { blockerId: ownerId, blockedId: viewerId }] } }),
    tx.moderationBlock.count({ where: { userId: { in: [viewerId, ownerId] }, isActive: true } }),
  ]);
  if (blocked || moderated) throw unavailable();
}

/** The cookie's user is the participant; no client-supplied user, opportunity or connection ID is trusted. */
export async function sharedConversation(token: string, viewerId?: string): Promise<SharedConversation> {
  const target = await prisma.weeklyIntent.findFirst({ where: readable(token, viewerId), select: { id: true, userId: true } });
  if (!target) throw unavailable();
  if (!viewerId) return { state: "NEW", messages: [] };
  if (viewerId === target.userId) return { state: "OWNER", messages: [] };
  return prisma.$transaction(async tx => {
    await pairAllowed(tx, viewerId, target.userId);
    const opportunity = await tx.mutualOpportunity.findFirst({ where: {
      OR: [{ userAId: viewerId, intentBId: target.id }, { userBId: viewerId, intentAId: target.id }],
      messageRequest: { isNot: null },
    }, include: { messageRequest: true }, orderBy: { createdAt: "desc" } });
    const connection = await tx.connection.findFirst({ where: {
      status: "ACTIVE",
      OR: [{ userAId: viewerId, userBId: target.userId }, { userBId: viewerId, userAId: target.userId }],
    } });
    if (connection) {
      const messages = await tx.message.findMany({ where: { connectionId: connection.id, deletedAt: null,
        type: { in: ["TEXT", "PLAN_REQUEST_CARD", "PLAN_CONFIRMED_CARD"] } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
        select: { id: true, senderId: true, body: true, type: true, createdAt: true,
          planRequest: { select: { id: true, title: true, location: true, message: true, startTime: true,
            endTime: true, status: true, receiverUserId: true, cancellationNotice: { select: { id: true } } } } } });
      return { state: "CONNECTED", connectionId: connection.id, messages: messages.reverse().map(m => {
        const p = m.planRequest;
        const status = p?.cancellationNotice ? "CANCELED" : p?.status === "PENDING" && p.startTime <= new Date() ? "EXPIRED" : p?.status;
        return { id: m.id, mine: m.senderId === viewerId, body: m.body, type: m.type, createdAt: m.createdAt.toISOString(),
          plan: p ? { id: p.id, title: p.title, location: p.location, note: p.message,
            startAt: p.startTime.toISOString(), endAt: p.endTime.toISOString(), status: status!,
            canAccept: status === "PENDING" && p.receiverUserId === viewerId } : null };
      }) };
    }
    if (!opportunity?.messageRequest) return { state: "NEW", messages: [] };
    const intro = opportunity.messageRequest;
    // An ignored request remains pending to the sender, matching the native inbox policy.
    return { state: "WAITING", messages: [{ id: opportunity.id, mine: intro.senderId === viewerId,
      body: intro.body, type: "TEXT", createdAt: intro.createdAt.toISOString() }] };
  });
}

export async function sendShareMessage(token: string, viewerId: string, body: string, key: string, selectedTime?: SharedTimeSelection) {
  const seed = await prisma.weeklyIntent.findFirst({ where: readable(token, viewerId), select: { userId: true } });
  if (!seed) throw unavailable();
  if (seed.userId === viewerId) throw new IntentShareError(409, "This is your own intention.");
  return prisma.$transaction(tx => withCanonicalConnectionScope(tx, viewerId, seed.userId, async scope => {
    await pairAllowed(tx, viewerId, seed.userId);
    const claim = await claimIdempotency(tx, { scope: `intent-share:${token}`, actorId: viewerId, key,
      requestHash: hashIdempotencyRequest({ body, ...(selectedTime ? { selectedTime } : {}) }) });
    if (claim.kind === "replay") return { replay: true };
    if (claim.kind !== "owner") throw new IntentShareError(409, "This message is already being sent.");
    await tx.$queryRaw`SELECT "id" FROM "WeeklyIntent" WHERE "shareToken" = ${token} FOR UPDATE`;
    const target = await tx.weeklyIntent.findFirst({ where: readable(token, viewerId), select });
    if (!target) throw unavailable();
    if (selectedTime && !validSharedTimeSelection(selectedTime, target)) {
      throw new IntentShareError(409, "This time has changed or expired. Choose a time again; your message has been kept.", "SHARED_TIME_CHANGED");
    }
    if (scope.existing && scope.existing.status !== "ACTIVE") throw unavailable();
    let result: { recipientId: string; opportunityId?: string; connectionId?: string };
    if (scope.existing) {
      await createDirectMessageRecord(tx, { connectionId: scope.existing.id, senderId: viewerId, input: { type: "TEXT", body } });
      result = { recipientId: target.userId, connectionId: scope.existing.id };
    } else {
      const existing = await tx.mutualOpportunity.findFirst({ where: {
        OR: [{ userAId: viewerId, intentBId: target.id }, { userBId: viewerId, intentAId: target.id }],
        messageRequest: { isNot: null },
      } });
      if (existing) throw new IntentShareError(409, "Your greeting was sent. Wait for a reply here.");
      const backing = await tx.weeklyIntent.create({ data: { userId: viewerId, topic: target.topic,
        activityText: target.activityText, studyGoal: target.studyGoal, sportTag: target.sportTag,
        sportOtherNote: target.sportOtherNote, togetherMode: target.togetherMode,
        timeWindows: [], timePreference: { kind: "UNDECIDED" }, exploreResponseToId: target.id,
        expiresAt: target.expiresAt, automaticMatching: false, exploreVisible: false } });
      const opportunity = await tx.mutualOpportunity.create({ data: { userAId: target.userId, userBId: viewerId,
        intentAId: target.id, intentBId: backing.id, topic: target.topic, activityText: target.activityText,
        sportTag: target.sportTag, intentAStudyGoal: target.studyGoal, intentBStudyGoal: target.studyGoal,
        intentATogetherMode: target.togetherMode, intentBTogetherMode: target.togetherMode,
        expiresAt: target.expiresAt ?? new Date(Date.now() + 30 * 86400_000), status: "PENDING", contextSnapshot: {},
        messageRequest: { create: { senderId: viewerId, body } },
      } });
      await tx.mutualOpportunity.update({ where: { id: opportunity.id }, data: { contextSnapshot: {
        version: 1, sourceKind: "MUTUAL_OPPORTUNITY", sourceId: opportunity.id, isRepeat: false,
        sharedIntentId: target.id, title: target.activityText || target.studyGoal || target.sportOtherNote || target.topic,
        startsAt: selectedTime?.startAt ?? null, endsAt: selectedTime?.endAt ?? null,
        ...(selectedTime ? { sharedTimeSelection: selectedTime } : {}),
        timeContext: { kind: selectedTime ? "EXACT" : "UNDECIDED", startDate: null, endDate: null, period: "ANY", timeZone: target.timeZone },
        location: null, planType: target.topic === "STUDY" ? "STUDY" : target.topic === "FOOD" ? "MEAL" : target.topic === "SPORTS" ? "SPORTS" : "CUSTOM",
        participantIds: [target.userId, viewerId], author: { id: target.userId, displayName: target.user.nickname || target.user.username },
        course: null, matchKind: "EXACT_ACTIVITY", sharedContext: null, activityText: target.activityText,
        sportTag: target.sportTag, sportOtherNote: target.sportOtherNote,
        intentAStudyGoal: target.studyGoal, intentBStudyGoal: target.studyGoal,
        intentATogetherMode: target.togetherMode, intentBTogetherMode: target.togetherMode,
        messageRequestIntention: { activity: { topic: target.topic, activityText: target.activityText, studyGoal: target.studyGoal,
          sportTag: target.sportTag, sportOtherNote: target.sportOtherNote }, timeWindows: target.timeWindows, timePreference: target.timePreference },
      } } });
      result = { recipientId: target.userId, opportunityId: opportunity.id };
    }
    await completeIdempotency(tx, claim, { status: 201, body: { sent: true } });
    return result;
  }));
}

export async function registerShareGuest(userId: string, username: string, password: string) {
  const nickname = await validateNicknameForUser(defaultNicknameFromUsername(username));
  if (!nickname.ok) throw new IntentShareError(422, "Choose a different username.");
  const hashedPassword = await hashPassword(password);
  try {
    const result = await prisma.user.updateMany({ where: { id: userId, isGuest: true }, data: {
      username, hashedPassword, nickname: nickname.nickname, nicknameKey: nickname.nicknameKey,
      isGuest: false, onboardingComplete: true,
      // No fabricated school or verification; the user can complete their profile later.
    } });
    if (!result.count) throw new IntentShareError(409, "You are already signed in.");
  } catch (cause) {
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002")
      throw new IntentShareError(409, "This username is taken. Try another one.");
    throw cause;
  }
  return { username };
}
