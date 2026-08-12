import "server-only";

import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getClassmatePostDetailForViewer } from "@/lib/queries/classmate-post-detail";

const questionAuthorSelect = {
  id: true,
  username: true,
  nickname: true,
  avatarUrl: true,
  school: true,
  verifiedStudent: true,
} satisfies Prisma.UserSelect;

type QuestionAuthor = Prisma.UserGetPayload<{
  select: typeof questionAuthorSelect;
}>;

type CommentRow = {
  id: string;
  userId: string;
  body: string;
  createdAt: Date;
  user: QuestionAuthor;
};

function authorPayload(author: QuestionAuthor) {
  return {
    id: author.id,
    displayName: author.nickname?.trim() || author.username,
    avatarUrl: author.avatarUrl,
    school: author.school,
    verifiedStudent: author.verifiedStudent,
  };
}

function commentPayload(
  comment: CommentRow,
  viewerId: string,
  postAuthorId: string,
) {
  return {
    id: comment.id,
    body: comment.body,
    createdAt: comment.createdAt.toISOString(),
    isOwn: comment.userId === viewerId,
    canDelete: comment.userId === viewerId || postAuthorId === viewerId,
    author: authorPayload(comment.user),
  };
}

export async function loadNativeDiscoverPostQuestions(options: {
  userId: string;
  postId: string;
}) {
  const detail = await getClassmatePostDetailForViewer(
    options.postId,
    options.userId,
  );
  if (!detail.ok) return null;

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
    postId: options.postId,
    parentId: null,
    userId: { notIn: [...blockedUserIds] },
    user: { moderationBlocks: { none: { isActive: true } } },
  } satisfies Prisma.ClassmatePostCommentWhereInput;
  const [rows, total] = await Promise.all([
    prisma.classmatePostComment.findMany({
      where,
      select: {
        id: true,
        userId: true,
        body: true,
        createdAt: true,
        user: { select: questionAuthorSelect },
        reply: {
          select: {
            id: true,
            userId: true,
            body: true,
            createdAt: true,
            user: { select: questionAuthorSelect },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    }),
    prisma.classmatePostComment.count({ where }),
  ]);

  return {
    total,
    questions: rows.map((row) => ({
      ...commentPayload(row, options.userId, detail.author.id),
      canReply: detail.isAuthor && !row.reply,
      ...(row.reply
        ? { reply: commentPayload(row.reply, options.userId, detail.author.id) }
        : {}),
    })),
  };
}

export class DiscoverQuestionMutationError extends Error {
  constructor(
    readonly code:
      "NOT_FOUND" | "AUTHOR_ONLY" | "ALREADY_ANSWERED" | "FORBIDDEN" | "CLOSED",
  ) {
    super(code);
    this.name = "DiscoverQuestionMutationError";
  }
}

export async function createNativeDiscoverPostComment(options: {
  userId: string;
  postId: string;
  body: string;
  parentId?: string;
  tx: Prisma.TransactionClient;
}) {
  const post = await options.tx.classmatePost.findUnique({
    where: { id: options.postId },
    select: { userId: true, status: true, expiresAt: true },
  });
  if (!post) throw new DiscoverQuestionMutationError("NOT_FOUND");
  if (
    !options.parentId &&
    (post.status !== "ACTIVE" || post.expiresAt <= new Date())
  ) {
    throw new DiscoverQuestionMutationError("CLOSED");
  }

  let questionId: string | null = null;
  let recipientUserId = post.userId;
  if (options.parentId) {
    if (post.userId !== options.userId) {
      throw new DiscoverQuestionMutationError("AUTHOR_ONLY");
    }
    const parent = await options.tx.classmatePostComment.findFirst({
      where: {
        id: options.parentId,
        postId: options.postId,
        parentId: null,
      },
      select: { id: true, userId: true, reply: { select: { id: true } } },
    });
    if (!parent) throw new DiscoverQuestionMutationError("NOT_FOUND");
    if (parent.reply) {
      throw new DiscoverQuestionMutationError("ALREADY_ANSWERED");
    }
    questionId = parent.id;
    recipientUserId = parent.userId;
  }

  const comment = await options.tx.classmatePostComment.create({
    data: {
      postId: options.postId,
      userId: options.userId,
      parentId: questionId,
      body: options.body,
    },
    select: { id: true },
  });
  const threadId = questionId ?? comment.id;
  const thread = await options.tx.classmatePostComment.findUniqueOrThrow({
    where: { id: threadId },
    select: {
      id: true,
      userId: true,
      body: true,
      createdAt: true,
      user: { select: questionAuthorSelect },
      reply: {
        select: {
          id: true,
          userId: true,
          body: true,
          createdAt: true,
          user: { select: questionAuthorSelect },
        },
      },
    },
  });
  return {
    commentId: comment.id,
    questionId: threadId,
    thread: {
      ...commentPayload(thread, options.userId, post.userId),
      canReply: post.userId === options.userId && !thread.reply,
      ...(thread.reply
        ? { reply: commentPayload(thread.reply, options.userId, post.userId) }
        : {}),
    },
    notification: {
      recipientUserId,
      isReply: Boolean(questionId),
    },
  };
}

export async function deleteNativeDiscoverPostComment(options: {
  userId: string;
  postId: string;
  commentId: string;
  tx: Prisma.TransactionClient;
}) {
  const comment = await options.tx.classmatePostComment.findFirst({
    where: { id: options.commentId, postId: options.postId },
    select: {
      id: true,
      userId: true,
      parentId: true,
      post: { select: { userId: true } },
    },
  });
  if (!comment) throw new DiscoverQuestionMutationError("NOT_FOUND");
  if (
    comment.userId !== options.userId &&
    comment.post.userId !== options.userId
  ) {
    throw new DiscoverQuestionMutationError("FORBIDDEN");
  }
  await options.tx.classmatePostComment.delete({ where: { id: comment.id } });
  return {
    commentId: comment.id,
    threadId: comment.parentId ?? comment.id,
    deletedReply: Boolean(comment.parentId),
    deleted: true,
  };
}
