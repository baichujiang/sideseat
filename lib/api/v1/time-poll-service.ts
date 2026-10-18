import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { v1Error } from "@/lib/api/v1/http";
import { buildPollSlots, createTimePollSchema, saveTimePollResponseSchema, summarizePoll, sendPollInvitationsSchema, respondPollInvitationSchema, type PollSlot } from "@/lib/time-polls/domain";
import { hasPlanningBlock, lockPollPlan } from "@/lib/time-polls/planning";
import { timePollExpiresAt, timePollPhase } from "@/lib/time-polls/lifecycle";

export class TimePollError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function blockedUserIds(userId: string) {
  const blocks = await prisma.block.findMany({ where: { OR: [{ blockerId: userId }, { blockedId: userId }] }, select: { blockerId: true, blockedId: true } });
  return blocks.map((block) => block.blockerId === userId ? block.blockedId : block.blockerId);
}

export type TimePollActor = string | { guestId: string };

function accountId(actor: TimePollActor | null) { return typeof actor === "string" ? actor : null; }
function isActor(person: { userId: string | null; guestId: string | null }, actor: TimePollActor | null) {
  return typeof actor === "string" ? person.userId === actor : actor !== null && person.guestId === actor.guestId;
}
function identity(person: { userId: string | null; guestId: string | null }) { return person.userId ? `user:${person.userId}` : `guest:${person.guestId}`; }

async function accessiblePoll(token: string, actor: TimePollActor | null) {
  const userId = accountId(actor);
  const hidden = userId ? await blockedUserIds(userId) : [];
  const visible = { OR: [{ userId: null }, { userId: { notIn: hidden } }] };
  const poll = await prisma.timePoll.findFirst({
    where: { token, creatorId: { notIn: hidden } },
    include: { responses: { where: visible, orderBy: { id: "asc" } }, invitations: { where: visible, orderBy: { id: "asc" } } },
  });
  if (!poll) throw new TimePollError(404, "Plan unavailable.");
  if (actor && typeof actor !== "string" && !await prisma.timePollGuest.findFirst({ where: { id: actor.guestId, pollId: poll.id } })) {
    throw new TimePollError(403, "This participant session is unavailable. Reopen the shared link.");
  }
  return poll;
}

export async function getTimePoll(token: string, actor: TimePollActor | null, appOrigin: string) {
  const poll = await accessiblePoll(token, actor);
  const userId = accountId(actor);
  const viewer = userId ? await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true, nickname: true } }) : null;
  const guest = actor && typeof actor !== "string" ? await prisma.timePollGuest.findUniqueOrThrow({ where: { id: actor.guestId } }) : null;
  const slots = poll.slots as unknown as PollSlot[];
  const participants = poll.responses.map((response) => ({ id: response.id, displayName: response.displayName, slotIds: response.slotIds, isMe: isActor(response, actor), isGuest: response.guestId !== null }));
  const mine = participants.find((person) => person.isMe);
  const invitation = poll.invitations.find((person) => isActor(person, actor));
  return {
    token: poll.token, title: poll.title, timeZone: poll.timeZone, dates: poll.dates,
    startMinute: poll.startMinute, endMinute: poll.endMinute, slots, participants,
    mySlotIds: mine?.slotIds ?? [], myDisplayName: mine?.displayName ?? invitation?.displayName ?? guest?.displayName ?? (viewer ? viewer.nickname?.trim() || viewer.username : ""),
    didRespond: Boolean(mine), isOwner: poll.creatorId === userId,
    updatedAt: poll.updatedAt.toISOString(), shareUrl: `${appOrigin}/time-polls/${poll.token}`,
    summary: summarizePoll(slots, participants, poll.durationMinutes, poll.expectedCount),
    location: poll.location, durationMinutes: poll.durationMinutes, expectedCount: poll.expectedCount,
    planningMode: poll.planningMode, phase: timePollPhase(poll), expiresAt: timePollExpiresAt(poll)?.toISOString() ?? null, invitationVersion: poll.invitationVersion,
    chosenStart: poll.chosenStart?.toISOString() ?? null, chosenEnd: poll.chosenEnd?.toISOString() ?? null,
    invitations: poll.invitations.map((i) => ({ id: i.id, displayName: i.displayName, status: i.status, selected: i.selected, isMe: isActor(i, actor), isGuest: i.guestId !== null })),
  };
}

export async function listTimePolls(userId: string, appOrigin: string) {
  const hidden = await blockedUserIds(userId);
  const polls = await prisma.timePoll.findMany({
    where: { creatorId: { notIn: hidden }, OR: [{ creatorId: userId }, { responses: { some: { userId } } }, { invitations: { some: { userId } } }] },
    orderBy: { updatedAt: "desc" }, take: 50,
    select: { creatorId: true, token: true, title: true, timeZone: true, dates: true, endMinute: true, updatedAt: true, phase: true, chosenStart: true, chosenEnd: true, expectedCount: true,
      _count: { select: { responses: true } }, invitations: { select: { userId: true, selected: true, status: true } } },
  });
  return { polls: polls.map(({ _count, invitations, creatorId, endMinute, ...poll }) => ({ ...poll, updatedAt: poll.updatedAt.toISOString(),
    phase: timePollPhase({ ...poll, endMinute }), expiresAt: timePollExpiresAt({ ...poll, endMinute })?.toISOString() ?? null,
    chosenStart: poll.chosenStart?.toISOString() ?? null, chosenEnd: poll.chosenEnd?.toISOString() ?? null,
    respondedCount: _count.responses, acceptedCount: invitations.filter((i) => i.selected && i.status === "ACCEPTED").length,
    invitedCount: invitations.filter((i) => i.selected).length,
    isIncluded: creatorId === userId || invitations.some((i) => i.userId === userId && i.selected),
    myInvitationStatus: invitations.find((i) => i.userId === userId)?.status ?? null,
    shareUrl: `${appOrigin}/time-polls/${poll.token}` })) };
}

export async function createTimePoll(userId: string, input: z.infer<typeof createTimePollSchema>, appOrigin: string) {
  const { fixedStart, ...values } = input;
  const slots = buildPollSlots(input);
  if (!slots.length) throw new TimePollError(422, "Choose a time range with available time slots.");
  const fixed = input.planningMode === "FIXED";
  const start = fixedStart ? new Date(fixedStart) : null;
  if (fixed && (!start || start <= new Date() || !input.durationMinutes || !input.expectedCount)) throw new TimePollError(422, "Choose a future time, duration and participant count.");
  const viewer = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true, nickname: true } });
  const poll = await prisma.timePoll.create({ data: {
    ...values, dates: [...new Set(input.dates)].sort(), slots, token: randomBytes(24).toString("base64url"), creatorId: userId,
    phase: fixed ? "INVITING" : "COLLECTING", invitationVersion: fixed ? 1 : 0,
    chosenStart: fixed ? start : null, chosenEnd: fixed ? new Date(start!.getTime() + input.durationMinutes! * 60_000) : null,
    ...(fixed ? { invitations: { create: { userId, displayName: viewer.nickname?.trim() || viewer.username, status: "ACCEPTED", version: 1 } } } : {}),
  } });
  return getTimePoll(poll.token, userId, appOrigin);
}

export async function saveTimePollResponse(token: string, actor: TimePollActor, input: z.infer<typeof saveTimePollResponseSchema>, appOrigin: string) {
  await accessiblePoll(token, actor);
  await prisma.$transaction(async (tx) => {
    const poll = await lockPollPlan(tx, token, accountId(actor));
    if (!poll) throw new TimePollError(404, "Plan unavailable.");
    if (timePollPhase(poll) === "EXPIRED") throw new TimePollError(409, "This plan expired before it was confirmed. Create a new plan to arrange another time.");
    if (poll.phase !== "COLLECTING") throw new TimePollError(409, "An invitation has been sent. Respond to the proposed time.");
    if (await hasPlanningBlock(tx, [accountId(actor), poll.creatorId].filter((id): id is string => id !== null))) throw new TimePollError(404, "Plan unavailable.");
    if (poll.expectedCount && accountId(actor) !== poll.creatorId && !poll.responses.some((r) => isActor(r, actor))
      && poll.responses.filter((r) => r.userId !== poll.creatorId).length >= poll.expectedCount - 1) throw new TimePollError(409, "This plan's participant list is full.");
    const slotIds = [...new Set(input.slotIds)].sort((a, b) => a - b);
    const validIds = new Set((poll.slots as unknown as PollSlot[]).map((slot) => slot.id));
    if (slotIds.some((id) => !validIds.has(id))) throw new TimePollError(422, "Choose time slots from this poll.");
    await tx.timePollResponse.upsert({ where: typeof actor === "string" ? { pollId_userId: { pollId: poll.id, userId: actor } } : { pollId_guestId: { pollId: poll.id, guestId: actor.guestId } },
      create: { pollId: poll.id, ...(typeof actor === "string" ? { userId: actor } : { guestId: actor.guestId }), displayName: input.displayName, slotIds }, update: { displayName: input.displayName, slotIds } });
    if (typeof actor !== "string") await tx.timePollGuest.update({ where: { id: actor.guestId }, data: { displayName: input.displayName } });
    await tx.timePoll.update({ where: { id: poll.id }, data: { updatedAt: new Date() } });
  });
  return getTimePoll(token, actor, appOrigin);
}

export async function sendPollInvitations(token: string, userId: string, input: z.infer<typeof sendPollInvitationsSchema>, appOrigin: string) {
  await accessiblePoll(token, userId);
  await prisma.$transaction(async (tx) => {
    const poll = await lockPollPlan(tx, token, userId);
    if (!poll || poll.creatorId !== userId) throw new TimePollError(404, "Plan unavailable.");
    if (!["COLLECTING", "INVITING"].includes(timePollPhase(poll)) || poll.invitationVersion !== input.version || poll.planningMode === "FIXED") throw new TimePollError(409, "This plan changed or expired. Reopen it before sending an invitation.");
    const start = new Date(input.start), end = input.end ? new Date(input.end) : new Date(start.getTime() + (poll.durationMinutes ?? 60) * 60_000);
    if (start <= new Date()) throw new TimePollError(422, "Choose a future start time.");
    const range = (poll.slots as unknown as PollSlot[]).filter((s) => s.start >= start.toISOString() && s.end <= end.toISOString());
    if (!range.length || range[0].start !== start.toISOString() || range.at(-1)!.end !== end.toISOString() || range.some((s, i) => i > 0 && range[i - 1].end !== s.start)) throw new TimePollError(422, "Choose a complete activity window from this poll.");
    const ids = new Set(input.attendeeIds);
    const selected = poll.responses.filter((r) => ids.has(r.id));
    if (selected.length !== ids.size) throw new TimePollError(422, "Choose participants from this plan.");
    const roster = new Map(selected.map((person) => [identity(person), { userId: person.userId, guestId: person.guestId, displayName: person.displayName }]));
    const owner = await tx.user.findUniqueOrThrow({ where: { id: userId }, select: { nickname: true, username: true } });
    roster.set(`user:${userId}`, { userId, guestId: null, displayName: poll.responses.find((r) => r.userId === userId)?.displayName ?? owner.nickname ?? owner.username });
    if (roster.size > 20) throw new TimePollError(422, "Invite at most twenty people.");
    if (roster.size < 2) throw new TimePollError(422, "Invite at least one other person.");
    const userIds = [...roster.values()].flatMap((person) => person.userId ? [person.userId] : []);
    if (await hasPlanningBlock(tx, userIds)) throw new TimePollError(409, "This participant list is unavailable.");
    const version = poll.invitationVersion + 1;
    await tx.timePollInvitation.deleteMany({ where: { pollId: poll.id } });
    await tx.timePollInvitation.createMany({ data: [...roster.values()].map((person) => ({ pollId: poll.id, ...person, status: person.userId === userId ? "ACCEPTED" : "INVITED", version })) });
    await tx.timePoll.update({ where: { id: poll.id }, data: { phase: "INVITING", chosenStart: start, chosenEnd: end, invitationVersion: version } });
  });
  return getTimePoll(token, userId, appOrigin);
}

export async function respondPollInvitation(token: string, actor: TimePollActor, input: z.infer<typeof respondPollInvitationSchema>, appOrigin: string) {
  await accessiblePoll(token, actor);
  await prisma.$transaction(async (tx) => {
    const poll = await lockPollPlan(tx, token, accountId(actor));
    if (!poll) throw new TimePollError(404, "Plan unavailable.");
    const mine = poll.invitations.find((i) => isActor(i, actor));
    if (poll.invitationVersion !== input.version) throw new TimePollError(409, "The invitation time changed. Reopen the plan.");
    if (poll.phase === "CONFIRMED" && mine?.status === input.status) return;
    if (poll.phase !== "INVITING" || !poll.chosenStart || !poll.chosenEnd || poll.chosenStart <= new Date()) throw new TimePollError(409, "This invitation is no longer awaiting confirmation.");
    const fixed = poll.planningMode === "FIXED";
    const selected = poll.invitations.filter((i) => i.selected);
    if (!mine && !fixed) throw new TimePollError(403, "You are not included in this invitation.");
    const wantsSeat = input.status === "ACCEPTED";
    if (fixed && wantsSeat && !mine?.selected && selected.length >= (poll.expectedCount ?? 2)) throw new TimePollError(409, "This plan's participant list is full.");
    const userIds = [accountId(actor), ...selected.map((i) => i.userId)].filter((id): id is string => id !== null);
    if (await hasPlanningBlock(tx, userIds)) throw new TimePollError(404, "Plan unavailable.");
    const viewer = typeof actor === "string" ? await tx.user.findUniqueOrThrow({ where: { id: actor }, select: { nickname: true, username: true } }) : null;
    const guest = typeof actor !== "string" ? await tx.timePollGuest.findUniqueOrThrow({ where: { id: actor.guestId } }) : null;
    await tx.timePollInvitation.upsert({
      where: typeof actor === "string" ? { pollId_userId: { pollId: poll.id, userId: actor } } : { pollId_guestId: { pollId: poll.id, guestId: actor.guestId } },
      create: { pollId: poll.id, ...(typeof actor === "string" ? { userId: actor } : { guestId: actor.guestId }), displayName: guest?.displayName ?? (viewer ? viewer.nickname?.trim() || viewer.username : ""), status: input.status, version: input.version, selected: fixed ? wantsSeat : true },
      update: { status: input.status, selected: fixed ? wantsSeat : true } });
    const invitations = await tx.timePollInvitation.findMany({ where: { pollId: poll.id, selected: true } });
    const target = fixed ? poll.expectedCount ?? 2 : invitations.length;
    if (invitations.length >= target && invitations.length >= 2 && invitations.every((i) => i.status === "ACCEPTED")) {
      await tx.timePoll.update({ where: { id: poll.id }, data: { phase: "CONFIRMED", confirmedAt: new Date() } });
      for (const person of invitations) {
        // Guests confirm in the browser; only actual accounts own Calendar rows.
        if (!person.userId) continue;
        await tx.calendarEntry.upsert({ where: { userId_timePollId: { userId: person.userId, timePollId: poll.id } },
          create: { userId: person.userId, timePollId: poll.id, title: poll.title, location: poll.location, source: "time_poll_plan", eventType: "CUSTOM", startAt: poll.chosenStart, endAt: poll.chosenEnd,
            companions: { create: invitations.filter((other) => other.id !== person.id).map((other) => ({ userId: other.userId, displayName: other.displayName })) } },
          update: {} });
      }
    } else { await tx.timePoll.update({ where: { id: poll.id }, data: { updatedAt: new Date() } }); }
  });
  return getTimePoll(token, actor, appOrigin);
}

export async function renameTimePollParticipant(token: string, actor: TimePollActor, displayName: string, appOrigin: string) {
  await accessiblePoll(token, actor);
  await prisma.$transaction(async (tx) => {
    const poll = await lockPollPlan(tx, token, accountId(actor));
    if (!poll) throw new TimePollError(404, "Plan unavailable.");
    if (!["COLLECTING", "INVITING"].includes(timePollPhase(poll))) throw new TimePollError(409, "This plan is closed for nickname changes.");
    if (typeof actor !== "string" && await tx.timePollGuest.findFirst({ where: {
      pollId: poll.id, id: { not: actor.guestId }, displayName: { equals: displayName, mode: "insensitive" },
    } })) throw new TimePollError(409, "This name already has a response. Switch participant to continue it, or choose a different name.");
    const own = typeof actor === "string" ? { userId: actor } : { guestId: actor.guestId };
    await tx.timePollResponse.updateMany({ where: { pollId: poll.id, ...own }, data: { displayName } });
    await tx.timePollInvitation.updateMany({ where: { pollId: poll.id, ...own }, data: { displayName } });
    if (typeof actor !== "string") await tx.timePollGuest.update({ where: { id: actor.guestId }, data: { displayName } });
    await tx.timePoll.update({ where: { id: poll.id }, data: { updatedAt: new Date() } });
  });
  return getTimePoll(token, actor, appOrigin);
}

export async function cancelPollPlan(token: string, userId: string, version: number, appOrigin: string) {
  await accessiblePoll(token, userId);
  await prisma.$transaction(async (tx) => {
    const poll = await lockPollPlan(tx, token, userId);
    if (!poll || poll.creatorId !== userId) throw new TimePollError(404, "Plan unavailable.");
    if (poll.invitationVersion !== version) throw new TimePollError(409, "This plan changed. Reopen it.");
    await tx.timePoll.update({ where: { id: poll.id }, data: { phase: "CANCELLED", canceledAt: new Date() } });
    await tx.calendarEntry.deleteMany({ where: { timePollId: poll.id } });
  });
  return getTimePoll(token, userId, appOrigin);
}

export async function deleteTimePoll(token: string, userId: string) {
  await accessiblePoll(token, userId);
  await prisma.$transaction(async (tx) => {
    const poll = await lockPollPlan(tx, token, userId);
    if (!poll || poll.creatorId !== userId) throw new TimePollError(404, "Plan unavailable.");
    if (["INVITING", "CONFIRMED"].includes(timePollPhase(poll))) throw new TimePollError(409, "Cancel the plan before deleting it.");
    await tx.timePoll.delete({ where: { id: poll.id } });
  });
  return { deleted: true };
}

export function timePollFailure(request: Request, cause: unknown) {
  if (cause instanceof TimePollError) return v1Error(request, { code: cause.status === 401 ? "AUTHENTICATION_REQUIRED" : cause.status === 429 ? "RATE_LIMITED" : cause.status === 404 ? "NOT_FOUND" : cause.status === 403 ? "CONTENT_RESTRICTED" : cause.status === 409 ? "STATE_CONFLICT" : "INVALID_REQUEST", message: cause.message, status: cause.status });
  console.error("Time poll request failed", cause);
  return v1Error(request, { code: "INTERNAL_ERROR", message: "The plan could not be saved or loaded.", status: 500, retryable: true });
}
