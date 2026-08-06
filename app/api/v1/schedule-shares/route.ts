import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import {
  ScheduleShareServiceError,
  createStandaloneScheduleShare,
  mapScheduleShareError,
} from "@/lib/api/v1/schedule-share-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { createScheduleShareSchema } from "@/lib/schedule-share/validation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const parsed = await parseV1Json(request, createScheduleShareSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: "native-schedule-share-link",
      requestBody: parsed.data,
      execute: async () => ({
        status: 201,
        body: await createStandaloneScheduleShare({
          userId: auth.user.id,
          appOrigin: requestAppOrigin(request),
          input: parsed.data,
        }),
      }),
    });
  } catch (cause) {
    if (cause instanceof ScheduleShareServiceError) {
      return v1Error(request, mapScheduleShareError(cause));
    }
    console.error("POST /api/v1/schedule-shares", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The schedule link could not be created.",
      status: 500,
      retryable: true,
    });
  }
}
