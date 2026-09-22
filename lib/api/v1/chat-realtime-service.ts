import "server-only";

import type { ChatRealtimeEvent } from "@prisma/client";

import {
  type ChatRealtimeConversationKind,
  type ChatRealtimeDelivery,
} from "@/lib/api/v1/chat-realtime";
import { directMessageV1, directMessageV1Include } from "@/lib/api/v1/chat-dto";
import {
  courseMessageV1,
  courseMessageV1Include,
  groupMessageV1,
  groupMessageV1Include,
} from "@/lib/api/v1/community-chat-dto";
import { activeDirectConnectionWhere } from "@/lib/chat/direct-message-service";
import { hiddenCommunityChatSenderIds } from "@/lib/chat/community-chat-service";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { prisma } from "@/lib/db/prisma";

const eventSelect = {
  sequence: true,
  messageId: true,
  senderId: true,
  eventType: true,
  occurredAt: true,
} as const;

type RealtimeEventRow = Pick<
  ChatRealtimeEvent,
  "sequence" | "messageId" | "senderId" | "eventType" | "occurredAt"
>;

async function loadEvents(
  conversationKind: ChatRealtimeConversationKind,
  conversationId: string,
  after: bigint,
  take: number,
) {
  return prisma.chatRealtimeEvent.findMany({
    where: {
      conversationKind,
      conversationId,
      sequence: { gt: after },
    },
    orderBy: { sequence: "asc" },
    take,
    select: eventSelect,
  });
}

function deliveryForEvent<T>(event: RealtimeEventRow, message: T | undefined) {
  const base = {
    sequence: event.sequence,
    messageId: event.messageId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
  };
  if (event.eventType === "REMOVE") {
    return { ...base, delivery: "REMOVE" as const };
  }
  if (message) {
    return { ...base, delivery: "UPSERT" as const, message };
  }
  return { ...base, delivery: "SKIP" as const };
}

function communityDeliveryForEvent<T>(
  event: RealtimeEventRow,
  message: T | undefined,
  hiddenSenderIds: Set<string>,
) {
  if (!event.senderId || hiddenSenderIds.has(event.senderId)) {
    return {
      sequence: event.sequence,
      messageId: event.messageId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      delivery: "SKIP" as const,
    };
  }
  return deliveryForEvent(event, message);
}

export async function currentChatRealtimeSequence(
  conversationKind: ChatRealtimeConversationKind,
  conversationId: string,
) {
  const [event, retention] = await Promise.all([
    prisma.chatRealtimeEvent.findFirst({
      where: { conversationKind, conversationId },
      orderBy: { sequence: "desc" },
      select: { sequence: true },
    }),
    prisma.chatRealtimeRetention.findUnique({
      where: { conversationKind_conversationId: { conversationKind, conversationId } },
      select: { retainedAfterSequence: true },
    }),
  ]);
  const eventSequence = event?.sequence ?? 0n;
  const retainedSequence = retention?.retainedAfterSequence ?? 0n;
  return eventSequence > retainedSequence ? eventSequence : retainedSequence;
}

export async function chatRealtimeRetentionFloor(
  conversationKind: ChatRealtimeConversationKind,
  conversationId: string,
) {
  const retention = await prisma.chatRealtimeRetention.findUnique({
    where: { conversationKind_conversationId: { conversationKind, conversationId } },
    select: { retainedAfterSequence: true },
  });
  return retention?.retainedAfterSequence ?? 0n;
}

export async function isDirectChatRealtimeAuthorized(connectionId: string, userId: string) {
  const connection = await prisma.connection.findFirst({
    where: activeDirectConnectionWhere(connectionId, userId),
    select: { id: true },
  });
  return connection !== null;
}

export async function loadDirectChatRealtimeDeliveries(
  connectionId: string,
  viewerId: string,
  after: bigint,
  take: number,
): Promise<ChatRealtimeDelivery<ReturnType<typeof directMessageV1>>[]> {
  const events = await loadEvents("DIRECT", connectionId, after, take);
  if (events.length === 0) return [];

  const messageIds = [...new Set(events.filter((event) => event.eventType !== "REMOVE").map((event) => event.messageId))];
  const messages = messageIds.length
    ? await prisma.message.findMany({
        where: { id: { in: messageIds }, connectionId },
        include: directMessageV1Include,
      })
    : [];
  const byId = new Map(
    messages.map((message) => [message.id, directMessageV1(message, viewerId)]),
  );
  return events.map((event) => deliveryForEvent(event, byId.get(event.messageId)));
}

export async function isCourseChatRealtimeAuthorized(courseId: string, userId: string) {
  const membership = await prisma.userCourse.findFirst({
    where: { userId, courseId, ...activeCourseMembershipWhere() },
    select: { id: true },
  });
  return membership !== null;
}

export async function loadCourseChatRealtimeDeliveries(
  courseId: string,
  viewerId: string,
  after: bigint,
  take: number,
): Promise<ChatRealtimeDelivery<ReturnType<typeof courseMessageV1>>[]> {
  const events = await loadEvents("COURSE", courseId, after, take);
  if (events.length === 0) return [];

  const hiddenSenderIds = new Set(await hiddenCommunityChatSenderIds(prisma, viewerId));
  const messageIds = [...new Set(events.filter((event) => event.eventType !== "REMOVE").map((event) => event.messageId))];
  const messages = messageIds.length
    ? await prisma.courseRoomMessage.findMany({
        where: {
          id: { in: messageIds },
          courseId,
          ...(hiddenSenderIds.size ? { senderId: { notIn: [...hiddenSenderIds] } } : {}),
        },
        include: courseMessageV1Include,
      })
    : [];
  const byId = new Map(messages.map((message) => [message.id, courseMessageV1(message)]));
  return events.map((event) =>
    communityDeliveryForEvent(event, byId.get(event.messageId), hiddenSenderIds),
  );
}

export async function isGroupChatRealtimeAuthorized(groupChatId: string, userId: string) {
  const membership = await prisma.groupChatParticipant.findUnique({
    where: { groupChatId_userId: { groupChatId, userId } },
    select: { groupChatId: true },
  });
  return membership !== null;
}

export async function loadGroupChatRealtimeDeliveries(
  groupChatId: string,
  viewerId: string,
  after: bigint,
  take: number,
): Promise<ChatRealtimeDelivery<ReturnType<typeof groupMessageV1>>[]> {
  const events = await loadEvents("GROUP", groupChatId, after, take);
  if (events.length === 0) return [];

  const hiddenSenderIds = new Set(await hiddenCommunityChatSenderIds(prisma, viewerId));
  const messageIds = [...new Set(events.filter((event) => event.eventType !== "REMOVE").map((event) => event.messageId))];
  const messages = messageIds.length
    ? await prisma.groupChatMessage.findMany({
        where: {
          id: { in: messageIds },
          groupChatId,
          ...(hiddenSenderIds.size ? { senderId: { notIn: [...hiddenSenderIds] } } : {}),
        },
        include: groupMessageV1Include,
      })
    : [];
  const byId = new Map(messages.map((message) => [message.id, groupMessageV1(message)]));
  return events.map((event) =>
    communityDeliveryForEvent(event, byId.get(event.messageId), hiddenSenderIds),
  );
}
