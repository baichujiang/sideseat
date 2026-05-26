import { z } from "zod";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";

const voteSchema = z.object({
  value: z.enum(["UP", "DOWN"]).nullable(),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ feedbackId: string }> },
) {
  try {
    const user = await requireUser();
    if (user.isGuest) return error("Please create a full account to vote.", 403);
    const { feedbackId } = await params;
    const raw = await request.json().catch(() => ({}));
    const parsed = parseBody(raw, voteSchema);
    if (!parsed.ok) return error(parsed.error, 422);

    const exists = await prisma.productFeedback.findUnique({
      where: { id: feedbackId },
      select: { id: true },
    });
    if (!exists) return error("Feedback not found.", 404);

    if (parsed.data.value === null) {
      await prisma.productFeedbackVote.deleteMany({
        where: { feedbackId, userId: user.id },
      });
      return ok({ saved: true });
    }

    await prisma.productFeedbackVote.upsert({
      where: { feedbackId_userId: { feedbackId, userId: user.id } },
      create: { feedbackId, userId: user.id, value: parsed.data.value },
      update: { value: parsed.data.value },
    });

    return ok({ saved: true });
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
    return error("Could not save vote.");
  }
}
