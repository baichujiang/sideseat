import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  FeedbackServiceError,
  createFeedbackPost,
  listFeedbackPosts,
} from "@/lib/api/v1/feedback-service";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

const createSchema = z.object({
  topic: z.enum(["bug", "idea", "other"]).optional(),
  title: z.string().trim().min(3).max(120).optional(),
  message: z.string().trim().min(10).max(4000),
});

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  try {
    const payload = await listFeedbackPosts({
      userId: auth.user.id,
      email: auth.user.email,
      username: auth.user.username,
    });
    return v1Success(payload, { request });
  } catch (cause) {
    if (cause instanceof FeedbackServiceError) {
      return v1Error(request, {
        code: "CONTENT_RESTRICTED",
        message: cause.messageText,
        status: 403,
      });
    }
    console.error("GET /api/v1/feedback", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Feedback could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseV1Json(request, createSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: "native-feedback-create",
      requestBody: parsed.data,
      execute: async () => ({
        status: 201,
        body: await createFeedbackPost({
          userId: auth.user.id,
          email: auth.user.email,
          nickname: auth.user.nickname,
          topic: parsed.data.topic,
          title: parsed.data.title,
          message: parsed.data.message,
        }),
      }),
    });
  } catch (cause) {
    if (cause instanceof FeedbackServiceError) {
      return v1Error(request, {
        code: "CONTENT_RESTRICTED",
        message: cause.messageText,
        status: 403,
      });
    }
    console.error("POST /api/v1/feedback", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Feedback could not be submitted.",
      status: 500,
      retryable: true,
    });
  }
}
