import type { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { weeklyIntentCreateSchema } from "@/lib/validators/weekly-intent";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import {
  createWeeklyIntent,
  loadCurrentWeeklyIntent,
  WeeklyIntentError,
} from "@/lib/v2/weekly-intents";

export const dynamic = "force-dynamic";

function unavailable(request: Request) {
  return v1Error(request, {
    code: "FEATURE_UNAVAILABLE",
    message: "Weekly Intent is not available.",
    status: 404,
  });
}

function domainError(request: Request, cause: WeeklyIntentError) {
  switch (cause.code) {
    case "WEEKLY_INTENT_LIMIT_REACHED":
      return v1Error(request, {
        code: "STATE_CONFLICT",
        message: "End an existing Weekly Intent before adding another.",
        status: 409,
      });
    case "WEEKLY_INTENT_COURSE_INVALID":
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Choose a current course from your courses.",
        status: 422,
        field: "courseId",
      });
    case "WEEKLY_INTENT_WINDOW_INVALID":
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Time windows must be in the future and end before this week expires.",
        status: 422,
        field: "timeWindows",
      });
    case "WEEKLY_INTENT_ACTIVITY_INVALID":
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Describe the concrete activity for this intention.",
        status: 422,
        field: "activityText",
      });
    case "WEEKLY_INTENT_SPORT_INVALID":
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Choose a concrete sport. Other sports need a short description.",
        status: 422,
        field: "sportTag",
      });
    case "WEEKLY_INTENT_STUDY_GOAL_INVALID":
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "A study goal can only be set for a study intention.",
        status: 422,
        field: "studyGoal",
      });
    case "WEEKLY_INTENT_TOGETHER_MODE_INVALID":
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Parallel mode is currently available only for study intentions.",
        status: 422,
        field: "togetherMode",
      });
    default:
      return v1Error(request, {
        code: "STATE_CONFLICT",
        message: "The Weekly Intent changed. Reload and try again.",
        status: 409,
      });
  }
}

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  try {
    return v1Success(await loadCurrentWeeklyIntent(auth.user.id), { request });
  } catch (cause) {
    console.error("GET /api/v1/me/weekly-intents", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Weekly Intent could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!isV2FeatureEnabled("v2WeeklyIntent")) {
    return unavailable(request);
  }
  const parsed = await parseV1Json(request, weeklyIntentCreateSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: "weekly-intent-create-v1",
      requestBody: parsed.data,
      execute: async () => ({
        status: 201,
        body: (await createWeeklyIntent(auth.user.id, parsed.data)) as unknown as Prisma.InputJsonValue,
      }),
    });
  } catch (cause) {
    if (cause instanceof WeeklyIntentError) return domainError(request, cause);
    console.error("POST /api/v1/me/weekly-intents", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Weekly Intent could not be created.",
      status: 500,
      retryable: true,
    });
  }
}
