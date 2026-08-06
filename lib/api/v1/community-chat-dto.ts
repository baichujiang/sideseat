import type { Prisma } from "@prisma/client";

const authorSelect = {
  id: true,
  username: true,
  nickname: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

export const courseMessageV1Include = {
  sender: { select: authorSelect },
  replyTo: { include: { sender: { select: authorSelect } } },
} satisfies Prisma.CourseRoomMessageInclude;

export const groupMessageV1Include = {
  sender: { select: authorSelect },
  replyTo: { include: { sender: { select: authorSelect } } },
} satisfies Prisma.GroupChatMessageInclude;

type CourseMessageRow = Prisma.CourseRoomMessageGetPayload<{
  include: typeof courseMessageV1Include;
}>;
type GroupMessageRow = Prisma.GroupChatMessageGetPayload<{
  include: typeof groupMessageV1Include;
}>;

function authorV1(user: CourseMessageRow["sender"] | GroupMessageRow["sender"]) {
  return {
    id: user.id,
    username: user.username,
    nickname: user.nickname,
    avatarUrl: user.avatarUrl,
  };
}

export function courseMessageV1(message: CourseMessageRow) {
  return {
    id: message.id,
    conversationId: message.courseId,
    sender: authorV1(message.sender),
    type: "TEXT" as const,
    body: message.deletedAt ? null : message.body,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          sender: authorV1(message.replyTo.sender),
          body: message.replyTo.deletedAt ? null : message.replyTo.body,
          deletedAt: message.replyTo.deletedAt?.toISOString() ?? null,
        }
      : null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}

export function groupMessageV1(message: GroupMessageRow) {
  return {
    id: message.id,
    conversationId: message.groupChatId,
    sender: authorV1(message.sender),
    type: "TEXT" as const,
    body: message.deletedAt ? null : message.body,
    replyTo: message.replyTo
      ? {
          id: message.replyTo.id,
          sender: authorV1(message.replyTo.sender),
          body: message.replyTo.deletedAt ? null : message.replyTo.body,
          deletedAt: message.replyTo.deletedAt?.toISOString() ?? null,
        }
      : null,
    deletedAt: message.deletedAt?.toISOString() ?? null,
    createdAt: message.createdAt.toISOString(),
  };
}
