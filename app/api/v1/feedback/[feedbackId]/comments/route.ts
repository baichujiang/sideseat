import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  FeedbackServiceError,
  commentOnFeedbackPost,
} from "@/lib/api/v1/feedback-service";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

const commentSchema = z.object({
  body: z.string().trim().min(2).max(1200),
});

export async function POST(
  request: Request,
  { params }: { params: Promise<{ feedbackId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { feedbackId } = await params;
  const idCheck = requireV1Cuid(request, feedbackId, "feedbackId");
  if (!idCheck.ok) return idCheck.response;

  const parsed = await parseV1Json(request, commentSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-feedback-comment:${feedbackId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 201,
        body: await commentOnFeedbackPost({
          userId: auth.user.id,
          email: auth.user.email,
          username: auth.user.username,
          feedbackId,
          body: parsed.data.body,
        }),
      }),
    });
  } catch (cause) {
    if (cause instanceof FeedbackServiceError) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: cause.messageText,
        status: 404,
      });
    }
    console.error("POST /api/v1/feedback/[feedbackId]/comments", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The comment could not be added.",
      status: 500,
      retryable: true,
    });
  }
}