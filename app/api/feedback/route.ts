import type { ProductFeedbackTopic } from "@prisma/client";
import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { APP_NAME, isConfiguredAdmin } from "@/lib/constants/app";
import { getFeedbackInboxEmail } from "@/lib/constants/support";
import { prisma } from "@/lib/db/prisma";
import { emailDeliveryConfigured } from "@/lib/email/resend";
import { sendProductFeedback } from "@/lib/email/send-product-feedback";
import { error, ok, parseBody } from "@/lib/http";

const bodySchema = z.object({
  topic: z.enum(["bug", "idea", "other"]).optional(),
  title: z.string().trim().min(3).max(120).optional(),
  message: z.string().trim().min(10, "Please write at least 10 characters.").max(4000),
});

function topicFromBody(raw: string | undefined): ProductFeedbackTopic {
  switch (raw) {
    case "bug":
      return "BUG";
    case "idea":
      return "IDEA";
    default:
      return "OTHER";
  }
}

export async function GET() {
  try {
    const user = await requireUser();
    if (user.isGuest) {
      return error("Please create a full account to view feedback.", 403);
    }

    const rows = await prisma.productFeedback.findMany({
      include: {
        user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
        votes: { select: { userId: true, value: true } },
        comments: {
          include: {
            user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "asc" },
          take: 8,
        },
        _count: { select: { comments: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: 200,
    });

    const posts = rows
      .map((row) => {
        const up = row.votes.filter((v) => v.value === "UP").length;
        const down = row.votes.filter((v) => v.value === "DOWN").length;
        const lastCommentAt = row.comments.at(-1)?.createdAt ?? null;
        const activeAt = lastCommentAt && lastCommentAt > row.updatedAt ? lastCommentAt : row.updatedAt;
        const score = up - down;
        return {
          id: row.id,
          topic: row.topic,
          title: row.title?.trim() || row.message.split(/\n/)[0]?.slice(0, 80) || "Feedback",
          message: row.message,
          createdAt: row.createdAt.toISOString(),
          activeAt: activeAt.toISOString(),
          author: {
            id: row.user.id,
            name: row.user.nickname?.trim() || row.user.username,
            avatarUrl: row.user.avatarUrl,
          },
          score,
          up,
          down,
          commentCount: row._count.comments,
          myVote: row.votes.find((v) => v.userId === user.id)?.value ?? null,
          comments: row.comments.map((comment) => ({
            id: comment.id,
            body: comment.body,
            isOfficial: comment.isOfficial,
            createdAt: comment.createdAt.toISOString(),
            author: {
              id: comment.user.id,
              name: comment.user.nickname?.trim() || comment.user.username,
              avatarUrl: comment.user.avatarUrl,
            },
          })),
        };
      })
      .sort((a, b) => {
        const rankA = a.score * 10 + a.commentCount * 2 + Date.parse(a.activeAt) / 86_400_000;
        const rankB = b.score * 10 + b.commentCount * 2 + Date.parse(b.activeAt) / 86_400_000;
        return rankB - rankA;
      });

    return ok({ posts, viewer: { isAdmin: isConfiguredAdmin(user) } });
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "digest" in cause &&
      typeof (cause as { digest?: unknown }).digest === "string" &&
      String((cause as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw cause;
    }
    console.error(cause);
    return error("Could not load feedback.");
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (user.isGuest) {
      return error("Please create a full account to send in-app feedback.", 403);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return error("Invalid JSON body.", 400);
    }

    const parsed = parseBody(raw, bodySchema);
    if (!parsed.ok) {
      return error(parsed.error, 400);
    }

    const topic = topicFromBody(parsed.data.topic);

    const row = await prisma.productFeedback.create({
      data: {
        userId: user.id,
        topic,
        title: parsed.data.title?.trim() || null,
        message: parsed.data.message,
      },
      select: { id: true },
    });

    const inbox = getFeedbackInboxEmail();
    if (emailDeliveryConfigured() && inbox) {
      const result = await sendProductFeedback({
        to: inbox,
        userId: user.id,
        userEmail: user.email,
        nickname: user.nickname,
        topic: parsed.data.topic ?? "other",
        message: parsed.data.message,
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

    return ok({ id: row.id });
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "digest" in cause &&
      typeof (cause as { digest?: unknown }).digest === "string" &&
      String((cause as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw cause;
    }
    console.error(cause);
    return error(`Could not submit feedback to ${APP_NAME}.`);
  }
}
