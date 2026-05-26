import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { isConfiguredAdmin } from "@/lib/constants/app";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";

const commentSchema = z.object({
  body: z.string().trim().min(2).max(1200),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ feedbackId: string }> },
) {
  try {
    const user = await requireUser();
    if (user.isGuest) return error("Please create a full account to comment.", 403);
    const { feedbackId } = await params;
    const raw = await request.json().catch(() => ({}));
    const parsed = parseBody(raw, commentSchema);
    if (!parsed.ok) return error(parsed.error, 422);

    const exists = await prisma.productFeedback.findUnique({
      where: { id: feedbackId },
      select: { id: true },
    });
    if (!exists) return error("Feedback not found.", 404);

    const comment = await prisma.productFeedbackComment.create({
      data: {
        feedbackId,
        userId: user.id,
        body: parsed.data.body,
        isOfficial: isConfiguredAdmin(user),
      },
      include: {
        user: { select: { id: true, username: true, nickname: true, avatarUrl: true } },
      },
    });

    await prisma.productFeedback.update({
      where: { id: feedbackId },
      data: { updatedAt: new Date() },
      select: { id: true },
    });

    return ok({
      comment: {
        id: comment.id,
        body: comment.body,
        isOfficial: comment.isOfficial,
        createdAt: comment.createdAt.toISOString(),
        author: {
          id: comment.user.id,
          name: comment.user.nickname?.trim() || comment.user.username,
          avatarUrl: comment.user.avatarUrl,
        },
      },
    });
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
    return error("Could not add comment.");
  }
}
