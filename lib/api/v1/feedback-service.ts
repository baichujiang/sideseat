import "server-only";

import type { ProductFeedbackTopic } from "@prisma/client";

import { isConfiguredAdmin } from "@/lib/constants/app";
import { getFeedbackInboxEmail } from "@/lib/constants/support";
import { prisma } from "@/lib/db/prisma";
import { emailDeliveryConfigured } from "@/lib/email/resend";
import { sendProductFeedback } from "@/lib/email/send-product-feedback";

export class FeedbackServiceError extends Error {
  constructor(
    readonly code: "FORBIDDEN" | "INVALID_REQUEST" | "NOT_FOUND",
    readonly messageText: string,
  ) {
    super(messageText);
    this.name = "FeedbackServiceError";
  }
}

function topicLabel(topic: ProductFeedbackTopic) {
  switch (topic) {
    case "BUG":
      return "bug";
    case "IDEA":
      return "idea";
    default:
      return "other";
  }
}

function topicFromInput(raw: string | undefined): ProductFeedbackTopic {
  switch (raw) {
    case "bug":
      return "BUG";
    case "idea":
      return "IDEA";
    default:
      return "OTHER";
  }
}

export async function listFeedbackPosts(options: {
  userId: string;
  email: string | null;
  username: string;
}) {
  const rows = await prisma.productFeedback.findMany({
    include: {
      user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
      votes: { select: { userId: true, value: true } },
      _count: { select: { comments: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 50,
  });

  const posts = rows.map((row) => {
    const up = row.votes.filter((vote) => vote.value === "UP").length;
    const down = row.votes.filter((vote) => vote.value === "DOWN").length;
    return {
      id: row.id,
      topic: topicLabel(row.topic),
      title: row.title?.trim() || row.message.split(/\n/)[0]?.slice(0, 80) || "Feedback",
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: {
        id: row.user.id,
        username: row.user.username,
        nickname: row.user.nickname,
        avatarUrl: row.user.avatarUrl,
      },
      score: up - down,
      up,
      down,
      commentCount: row._count.comments,
      myVote: row.votes.find((vote) => vote.userId === options.userId)?.value ?? null,
    };
  });

  return {
    posts,
    viewer: {
      isAdmin: isConfiguredAdmin({
        email: options.email,
        username: options.username,
      }),
    },
  };
}

export async function createFeedbackPost(options: {
  userId: string;
  email: string | null;
  nickname: string | null;
  topic?: string;
  title?: string | null;
  message: string;
}) {
  const topic = topicFromInput(options.topic);
  const row = await prisma.productFeedback.create({
    data: {
      userId: options.userId,
      topic,
      title: options.title?.trim() || null,
      message: options.message,
    },
    select: { id: true },
  });

  const inbox = getFeedbackInboxEmail();
  if (emailDeliveryConfigured() && inbox) {
    const result = await sendProductFeedback({
      to: inbox,
      userId: options.userId,
      userEmail: options.email,
      nickname: options.nickname,
      topic: options.topic ?? "other",
      message: options.message,
    });
    if (result.sent) {
      await prisma.productFeedback.update({
        where: { id: row.id },
        data: {
          emailSentAt: new Date(),
          emailProviderId: result.id ?? null,
        },
      });
    }
  }

  return { id: row.id };
}

export async function getFeedbackPost(options: {
  userId: string;
  feedbackId: string;
}) {
  const row = await prisma.productFeedback.findUnique({
    where: { id: options.feedbackId },
    include: {
      user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
      votes: { select: { userId: true, value: true } },
      comments: {
        include: {
          user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      },
      _count: { select: { comments: true } },
    },
  });
  if (!row) {
    throw new FeedbackServiceError("NOT_FOUND", "Feedback not found.");
  }

  const up = row.votes.filter((vote) => vote.value === "UP").length;
  const down = row.votes.filter((vote) => vote.value === "DOWN").length;
  return {
    post: {
      id: row.id,
      topic: topicLabel(row.topic),
      title: row.title?.trim() || row.message.split(/\n/)[0]?.slice(0, 80) || "Feedback",
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      author: {
        id: row.user.id,
        username: row.user.username,
        nickname: row.user.nickname,
        avatarUrl: row.user.avatarUrl,
      },
      score: up - down,
      up,
      down,
      commentCount: row._count.comments,
      myVote: row.votes.find((vote) => vote.userId === options.userId)?.value ?? null,
      comments: row.comments.map((comment) => ({
        id: comment.id,
        body: comment.body,
        isOfficial: comment.isOfficial,
        createdAt: comment.createdAt.toISOString(),
        author: {
          id: comment.user.id,
          username: comment.user.username,
          nickname: comment.user.nickname,
          avatarUrl: comment.user.avatarUrl,
        },
      })),
    },
  };
}

export async function voteFeedbackPost(options: {
  userId: string;
  feedbackId: string;
  value: "UP" | "DOWN" | null;
}) {
  const exists = await prisma.productFeedback.findUnique({
    where: { id: options.feedbackId },
    select: { id: true },
  });
  if (!exists) {
    throw new FeedbackServiceError("NOT_FOUND", "Feedback not found.");
  }

  if (options.value === null) {
    await prisma.productFeedbackVote.deleteMany({
      where: { feedbackId: options.feedbackId, userId: options.userId },
    });
  } else {
    await prisma.productFeedbackVote.upsert({
      where: {
        feedbackId_userId: {
          feedbackId: options.feedbackId,
          userId: options.userId,
        },
      },
      create: {
        feedbackId: options.feedbackId,
        userId: options.userId,
        value: options.value,
      },
      update: { value: options.value },
    });
  }

  return getFeedbackPost({
    userId: options.userId,
    feedbackId: options.feedbackId,
  });
}

export async function commentOnFeedbackPost(options: {
  userId: string;
  email: string | null;
  username: string;
  feedbackId: string;
  body: string;
}) {
  const exists = await prisma.productFeedback.findUnique({
    where: { id: options.feedbackId },
    select: { id: true },
  });
  if (!exists) {
    throw new FeedbackServiceError("NOT_FOUND", "Feedback not found.");
  }

  const comment = await prisma.productFeedbackComment.create({
    data: {
      feedbackId: options.feedbackId,
      userId: options.userId,
      body: options.body,
      isOfficial: isConfiguredAdmin({
        email: options.email,
        username: options.username,
      }),
    },
    include: {
      user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
    },
  });

  await prisma.productFeedback.update({
    where: { id: options.feedbackId },
    data: { updatedAt: new Date() },
    select: { id: true },
  });

  return {
    comment: {
      id: comment.id,
      body: comment.body,
      isOfficial: comment.isOfficial,
      createdAt: comment.createdAt.toISOString(),
      author: {
        id: comment.user.id,
        username: comment.user.username,
        nickname: comment.user.nickname,
        avatarUrl: comment.user.avatarUrl,
      },
    },
  };
}
