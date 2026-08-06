import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  FeedbackServiceError,
  voteFeedbackPost,
} from "@/lib/api/v1/feedback-service";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

const voteSchema = z.object({
  value: z.enum(["UP", "DOWN"]).nullable(),
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

  const parsed = await parseV1Json(request, voteSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-feedback-vote:${feedbackId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 200,
        body: await voteFeedbackPost({
          userId: auth.user.id,
          feedbackId,
          value: parsed.data.value,
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
    console.error("POST /api/v1/feedback/[feedbackId]/vote", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The vote could not be saved.",
      status: 500,
      retryable: true,
    });
  }
}
