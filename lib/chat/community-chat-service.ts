import type { Prisma, PrismaClient } from "@prisma/client";

import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";

type CommunityChatDb = Pick<
  PrismaClient,
  | "block"
  | "courseRoomMessage"
  | "groupChat"
  | "groupChatMessage"
  | "groupChatParticipant"
  | "moderationBlock"
  | "userCourse"
>;

export type CommunityChatCreateResult<T> =
  | { kind: "created"; message: T; notificationTitle: string | null }
  | { kind: "not_found" }
  | { kind: "restricted" };

export async function hiddenCommunityChatSenderIds(
  db: CommunityChatDb,
  viewerId: string,
) {
  const [moderationBlocks, mutualBlocks] = await Promise.all([
    db.moderationBlock.findMany({
      where: { isActive: true },
      select: { userId: true },
    }),
    db.block.findMany({
      where: { OR: [{ blockerId: viewerId }, { blockedId: viewerId }] },
      select: { blockerId: true, blockedId: true },
    }),
  ]);
  const hidden = new Set(moderationBlocks.map((block) => block.userId));
  for (const block of mutualBlocks) {
    hidden.add(block.blockerId === viewerId ? block.blockedId : block.blockerId);
  }
  hidden.delete(viewerId);
  return [...hidden];
}

export async function createCourseRoomMessageRecord(
  db: CommunityChatDb,
  input: { courseId: string; senderId: string; body: string; replyToId?: string },
): Promise<CommunityChatCreateResult<Awaited<ReturnType<CommunityChatDb["courseRoomMessage"]["create"]>>>> {
  const [membership, moderated] = await Promise.all([
    db.userCourse.findFirst({
      where: {
        userId: input.senderId,
        courseId: input.courseId,
        ...activeCourseMembershipWhere(),
      },
      select: { id: true, course: { select: { name: true } } },
    }),
    db.moderationBlock.findFirst({
      where: { userId: input.senderId, isActive: true },
      select: { id: true },
    }),
  ]);
  if (!membership) return { kind: "not_found" };
  if (moderated) return { kind: "restricted" };

  let replyToId: string | null = null;
  if (input.replyToId) {
    const target = await db.courseRoomMessage.findFirst({
      where: { id: input.replyToId, courseId: input.courseId, deletedAt: null },
      select: { id: true },
    });
    replyToId = target?.id ?? null;
  }

  const message = await db.courseRoomMessage.create({
    data: {
      courseId: input.courseId,
      senderId: input.senderId,
      body: input.body.trim(),
      replyToId,
    },
  });
  return { kind: "created", message, notificationTitle: membership.course.name };
}

export async function createGroupChatMessageRecord(
  db: CommunityChatDb,
  input: { groupChatId: string; senderId: string; body: string; replyToId?: string },
): Promise<CommunityChatCreateResult<Awaited<ReturnType<CommunityChatDb["groupChatMessage"]["create"]>>>> {
  const [membership, moderated] = await Promise.all([
    db.groupChatParticipant.findUnique({
      where: {
        groupChatId_userId: { groupChatId: input.groupChatId, userId: input.senderId },
      },
      select: { groupChat: { select: { title: true } } },
    }),
    db.moderationBlock.findFirst({
      where: { userId: input.senderId, isActive: true },
      select: { id: true },
    }),
  ]);
  if (!membership) return { kind: "not_found" };
  if (moderated) return { kind: "restricted" };

  let replyToId: string | null = null;
  if (input.replyToId) {
    const target = await db.groupChatMessage.findFirst({
      where: { id: input.replyToId, groupChatId: input.groupChatId, deletedAt: null },
      select: { id: true },
    });
    replyToId = target?.id ?? null;
  }

  const message = await db.groupChatMessage.create({
    data: {
      groupChatId: input.groupChatId,
      senderId: input.senderId,
      body: input.body.trim(),
      replyToId,
    },
  });
  await db.groupChat.update({
    where: { id: input.groupChatId },
    data: { updatedAt: message.createdAt },
  });
  return { kind: "created", message, notificationTitle: membership.groupChat.title };
}

export async function markCourseConversationRead(
  db: CommunityChatDb,
  courseId: string,
  userId: string,
) {
  const membership = await db.userCourse.findFirst({
    where: { userId, courseId, ...activeCourseMembershipWhere() },
    select: { id: true },
  });
  if (!membership) return null;
  const readAt = new Date();
  await db.userCourse.update({
    where: { id: membership.id },
    data: { courseChatReadAt: readAt },
  });
  return { readAt };
}

export async function markGroupConversationRead(
  db: CommunityChatDb,
  groupChatId: string,
  userId: string,
) {
  const membership = await db.groupChatParticipant.findUnique({
    where: { groupChatId_userId: { groupChatId, userId } },
    select: { groupChatId: true },
  });
  if (!membership) return null;
  const readAt = new Date();
  await db.groupChatParticipant.update({
    where: { groupChatId_userId: { groupChatId, userId } },
    data: { lastReadAt: readAt },
  });
  return { readAt };
}

export type CommunityChatTransaction = Prisma.TransactionClient;
