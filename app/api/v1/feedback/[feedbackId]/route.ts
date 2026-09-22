import { requireV1User } from "@/lib/api/v1/auth";
import {
  FeedbackServiceError,
  getFeedbackPost,
} from "@/lib/api/v1/feedback-service";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { v1Error, v1Success } from "@/lib/api/v1/http";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ feedbackId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { feedbackId } = await params;
  const idCheck = requireV1Cuid(request, feedbackId, "feedbackId");
  if (!idCheck.ok) return idCheck.response;

  try {
    const payload = await getFeedbackPost({
      userId: auth.user.id,
      feedbackId,
    });
    return v1Success(payload, { request });
  } catch (cause) {
    if (cause instanceof FeedbackServiceError) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: cause.messageText,
        status: 404,
      });
    }
    console.error("GET /api/v1/feedback/[feedbackId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Feedback could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
