import "server-only";

import { randomBytes } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db/prisma";
import { v1Error } from "@/lib/api/v1/http";
import { buildPollSlots, createTimePollSchema, saveTimePollResponseSchema, summarizePoll, type PollSlot } from "@/lib/time-polls/domain";

export class TimePollError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

async function blockedUserIds(userId: string) {
  const blocks = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  return blocks.map((block) => block.blockerId === userId ? block.blockedId : block.blockerId);
}

async function accessiblePoll(token: string, userId: string) {
  const hidden = await blockedUserIds(userId);
  const poll = await prisma.timePoll.findFirst({
    where: { token, creatorId: { notIn: hidden } },
    include: { responses: { where: { userId: { notIn: hidden } }, orderBy: { id: "asc" } } },
  });
  if (!poll) throw new TimePollError(404, "Time poll unavailable.");
  return poll;
}

export async function getTimePoll(token: string, userId: string, appOrigin: string) {
  const poll = await accessiblePoll(token, userId);
  const viewer = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { username: true, nickname: true } });
  const slots = poll.slots as unknown as PollSlot[];
  const participants = poll.responses.map((response) => ({
    id: response.id, displayName: response.displayName, slotIds: response.slotIds, isMe: response.userId === userId,
  }));
  const mine = participants.find((person) => person.isMe);
  return {
    token: poll.token, title: poll.title, timeZone: poll.timeZone, dates: poll.dates,
    startMinute: poll.startMinute, endMinute: poll.endMinute, slots, participants,
    mySlotIds: mine?.slotIds ?? [], myDisplayName: mine?.displayName ?? (viewer.nickname?.trim() || viewer.username),
    didRespond: Boolean(mine), isOwner: poll.creatorId === userId,
    updatedAt: poll.updatedAt.toISOString(), shareUrl: `${appOrigin}/time-polls/${poll.token}`,
    summary: summarizePoll(slots, participants),
  };
}

export async function listTimePolls(userId: string, appOrigin: string) {
  const hidden = await blockedUserIds(userId);
  const polls = await prisma.timePoll.findMany({
    where: { creatorId: { notIn: hidden }, OR: [{ creatorId: userId }, { responses: { some: { userId } } }] },
    orderBy: { updatedAt: "desc" }, take: 50,
    select: { token: true, title: true, timeZone: true, dates: true, updatedAt: true },
  });
  return { polls: polls.map((poll) => ({ ...poll, updatedAt: poll.updatedAt.toISOString(), shareUrl: `${appOrigin}/time-polls/${poll.token}` })) };
}

export async function createTimePoll(userId: string, input: z.infer<typeof createTimePollSchema>, appOrigin: string) {
  const slots = buildPollSlots(input);
  if (!slots.length) throw new TimePollError(422, "Choose a time range with available time slots.");
  const poll = await prisma.timePoll.create({ data: {
    ...input, dates: [...new Set(input.dates)].sort(), slots,
    token: randomBytes(24).toString("base64url"), creatorId: userId,
  } });
  return getTimePoll(poll.token, userId, appOrigin);
}

export async function saveTimePollResponse(token: string, userId: string, input: z.infer<typeof saveTimePollResponseSchema>, appOrigin: string) {
  const poll = await accessiblePoll(token, userId);
  const slotIds = [...new Set(input.slotIds)].sort((a, b) => a - b);
  const validIds = new Set((poll.slots as unknown as PollSlot[]).map((slot) => slot.id));
  if (slotIds.some((id) => !validIds.has(id))) throw new TimePollError(422, "Choose time slots from this poll.");
  await prisma.$transaction([
    prisma.timePollResponse.upsert({
      where: { pollId_userId: { pollId: poll.id, userId } },
      create: { pollId: poll.id, userId, displayName: input.displayName, slotIds },
      update: { displayName: input.displayName, slotIds },
    }),
    prisma.timePoll.update({ where: { id: poll.id }, data: { updatedAt: new Date() } }),
  ]);
  return getTimePoll(token, userId, appOrigin);
}

export async function deleteTimePoll(token: string, userId: string) {
  const deleted = await prisma.timePoll.deleteMany({ where: { token, creatorId: userId } });
  if (!deleted.count) throw new TimePollError(404, "Time poll unavailable.");
  return { deleted: true };
}

export function timePollFailure(request: Request, cause: unknown) {
  if (cause instanceof TimePollError) return v1Error(request, { code: cause.status === 404 ? "NOT_FOUND" : "INVALID_REQUEST", message: cause.message, status: cause.status });
  console.error("Time poll request failed", cause);
  return v1Error(request, { code: "INTERNAL_ERROR", message: "The time poll could not be saved or loaded.", status: 500, retryable: true });
}
