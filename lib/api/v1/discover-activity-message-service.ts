import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { loadNativeDiscoverActivityDetail } from "@/lib/api/v1/discover-service";

const messageAuthorSelect = {
  id: true,
  username: true,
  nickname: true,
  avatarUrl: true,
  school: true,
  verifiedStudent: true,
} satisfies Prisma.UserSelect;

type MessageAuthor = Prisma.UserGetPayload<{
  select: typeof messageAuthorSelect;
}>;

type MessageRow = {
  id: string;
  userId: string;
  body: string;
  createdAt: Date;
  user: MessageAuthor;
};

function authorPayload(author: MessageAuthor) {
  return {
    id: author.id,
    displayName: author.nickname?.trim() || author.username,
    avatarUrl: author.avatarUrl,
    school: author.school,
    verifiedStudent: author.verifiedStudent,
  };
}

function messagePayload(
  message: MessageRow,
  viewerId: string,
  organizerId: string,
) {
  return {
    id: message.id,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
    isOwn: message.userId === viewerId,
    canDelete: message.userId === viewerId || organizerId === viewerId,
    author: authorPayload(message.user),
  };
}

export async function loadNativeDiscoverActivityMessages(options: {
  userId: string;
  activityId: string;
}) {
  const detail = await loadNativeDiscoverActivityDetail(options);
  if (!detail) return null;

  const blocks = await prisma.block.findMany({
    where: {
      OR: [{ blockerId: options.userId }, { blockedId: options.userId }],
    },
    select: { blockerId: true, blockedId: true },
  });
  const blockedUserIds = new Set(
    blocks.flatMap((block) => [block.blockerId, block.blockedId]),
  );
  blockedUserIds.delete(options.userId);

  const where = {
    activityId: options.activityId,
    parentId: null,
    userId: { notIn: [...blockedUserIds] },
    user: { moderationBlocks: { none: { isActive: true } } },
  } satisfies Prisma.DiscoverActivityCommentWhereInput;
  const [rows, total] = await Promise.all([
    prisma.discoverActivityComment.findMany({
      where,
      select: {
        id: true,
        userId: true,
        body: true,
        createdAt: true,
        user: { select: messageAuthorSelect },
        reply: {
          select: {
            id: true,
            userId: true,
            body: true,
            createdAt: true,
            user: { select: messageAuthorSelect },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.discoverActivityComment.count({ where }),
  ]);

  const organizerId = detail.activity.organizer.id;
  return {
    total,
    messages: rows.map((row) => ({
      ...messagePayload(row, options.userId, organizerId),
      canReply: detail.activity.isOrganizer && !row.reply,
      ...(row.reply
        ? {
            reply: messagePayload(row.reply, options.userId, organizerId),
          }
        : {}),
    })),
  };
}

export class DiscoverActivityMessageMutationError extends Error {
  constructor(
    readonly code:
      | "NOT_FOUND"
      | "ORGANIZER_ONLY"
      | "ALREADY_ANSWERED"
      | "FORBIDDEN"
      | "CLOSED",
  ) {
    super(code);
    this.name = "DiscoverActivityMessageMutationError";
  }
}

export async function createNativeDiscoverActivityMessage(options: {
  userId: string;
  activityId: string;
  body: string;
  parentId?: string;
  tx: Prisma.TransactionClient;
}) {
  const activity = await options.tx.discoverActivity.findUnique({
    where: { id: options.activityId },
    select: { organizerId: true, status: true },
  });
  if (!activity) {
    throw new DiscoverActivityMessageMutationError("NOT_FOUND");
  }
  if (!options.parentId && activity.status !== "OPEN") {
    throw new DiscoverActivityMessageMutationError("CLOSED");
  }

  let messageId: string | null = null;
  let recipientUserId = activity.organizerId;
  if (options.parentId) {
    if (activity.organizerId !== options.userId) {
      throw new DiscoverActivityMessageMutationError("ORGANIZER_ONLY");
    }
    const parent = await options.tx.discoverActivityComment.findFirst({
      where: {
        id: options.parentId,
        activityId: options.activityId,
        parentId: null,
      },
      select: { id: true, userId: true, reply: { select: { id: true } } },
    });
    if (!parent) {
      throw new DiscoverActivityMessageMutationError("NOT_FOUND");
    }
    if (parent.reply) {
      throw new DiscoverActivityMessageMutationError("ALREADY_ANSWERED");
    }
    messageId = parent.id;
    recipientUserId = parent.userId;
  }

  const comment = await options.tx.discoverActivityComment.create({
    data: {
      activityId: options.activityId,
      userId: options.userId,
      parentId: messageId,
      body: options.body,
    },
    select: { id: true },
  });

  const threadId = messageId ?? comment.id;
  const thread = await options.tx.discoverActivityComment.findUniqueOrThrow({
    where: { id: threadId },
    select: {
      id: true,
      userId: true,
      body: true,
      createdAt: true,
      user: { select: messageAuthorSelect },
      reply: {
        select: {
          id: true,
          userId: true,
          body: true,
          createdAt: true,
          user: { select: messageAuthorSelect },
        },
      },
    },
  });
  return {
    commentId: comment.id,
    messageId: threadId,
    thread: {
      ...messagePayload(thread, options.userId, activity.organizerId),
      canReply: activity.organizerId === options.userId && !thread.reply,
      ...(thread.reply
        ? {
            reply: messagePayload(
              thread.reply,
              options.userId,
              activity.organizerId,
            ),
          }
        : {}),
    },
    notification: {
      recipientUserId,
      isReply: Boolean(messageId),
    },
  };
}

export async function deleteNativeDiscoverActivityMessage(options: {
  userId: string;
  activityId: string;
  commentId: string;
  tx: Prisma.TransactionClient;
}) {
  const comment = await options.tx.discoverActivityComment.findFirst({
    where: { id: options.commentId, activityId: options.activityId },
    select: {
      id: true,
      userId: true,
      parentId: true,
      activity: { select: { organizerId: true } },
    },
  });
  if (!comment) {
    throw new DiscoverActivityMessageMutationError("NOT_FOUND");
  }
  if (
    comment.userId !== options.userId &&
    comment.activity.organizerId !== options.userId
  ) {
    throw new DiscoverActivityMessageMutationError("FORBIDDEN");
  }

  await options.tx.discoverActivityComment.delete({
    where: { id: comment.id },
  });
  return {
    commentId: comment.id,
    threadId: comment.parentId ?? comment.id,
    deletedReply: Boolean(comment.parentId),
    deleted: true,
  };
}
