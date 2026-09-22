import { requireV1User } from "@/lib/api/v1/auth";
import { chatRealtimeSseResponse } from "@/lib/api/v1/chat-realtime";
import {
  chatRealtimeRetentionFloor,
  currentChatRealtimeSequence,
  isCourseChatRealtimeAuthorized,
  loadCourseChatRealtimeDeliveries,
} from "@/lib/api/v1/chat-realtime-service";
import { v1Error } from "@/lib/api/v1/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function validId(value: string) {
  return /^c[a-z0-9]{20,30}$/i.test(value);
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ courseId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { courseId } = await params;
  if (!validId(courseId)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The course identifier is invalid.",
      status: 422,
      field: "courseId",
    });
  }

  try {
    if (!(await isCourseChatRealtimeAuthorized(courseId, auth.user.id))) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The course conversation was not found.",
        status: 404,
      });
    }

    const conversation = { kind: "COURSE" as const, id: courseId };
    return await chatRealtimeSseResponse(request, {
      conversation,
      currentSequence: () => currentChatRealtimeSequence("COURSE", courseId),
      retentionFloor: () => chatRealtimeRetentionFloor("COURSE", courseId),
      isAuthorized: () => isCourseChatRealtimeAuthorized(courseId, auth.user.id),
      loadDeliveries: (after, take) =>
        loadCourseChatRealtimeDeliveries(courseId, auth.user.id, after, take),
    });
  } catch (cause) {
    console.error("GET /api/v1/courses/[courseId]/events", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to open the realtime course stream.",
      status: 500,
      retryable: true,
    });
  }
}
