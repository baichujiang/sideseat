import type { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import {
  weeklyIntentEndSchema,
  weeklyIntentPatchSchema,
} from "@/lib/validators/weekly-intent";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import {
  endWeeklyIntent,
  patchWeeklyIntent,
  WeeklyIntentError,
} from "@/lib/v2/weekly-intents";

export const dynamic = "force-dynamic";

const identifierSchema = z
  .string()
  .min(1)
  .max(191)
  .regex(/^[A-Za-z0-9._:-]+$/);

function unavailable(request: Request) {
  return v1Error(request, {
    code: "FEATURE_UNAVAILABLE",
    message: "Weekly Intent is not available.",
    status: 404,
  });
}

function domainError(request: Request, cause: WeeklyIntentError) {
  switch (cause.code) {
    case "WEEKLY_INTENT_NOT_FOUND":
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The Weekly Intent was not found.",
        status: 404,
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
    case "WEEKLY_INTENT_VERSION_CONFLICT":
      return v1Error(request, {
        code: "STATE_CONFLICT",
        message: "The Weekly Intent changed. Reload and try again.",
        status: 409,
      });
    case "WEEKLY_INTENT_TERMINAL":
    case "WEEKLY_INTENT_STATE_INVALID":
    case "WEEKLY_INTENT_LIMIT_REACHED":
      return v1Error(request, {
        code: "STATE_CONFLICT",
        message: "This Weekly Intent can no longer perform that action.",
        status: 409,
      });
  }
}

async function intentIdOrError(
  request: Request,
  params: Promise<{ intentId: string }>,
) {
  const { intentId } = await params;
  if (!identifierSchema.safeParse(intentId).success) {
    return {
      ok: false as const,
      response: v1Error(request, {
        code: "INVALID_REQUEST",
        message: "The Weekly Intent identifier is invalid.",
        status: 422,
        field: "intentId",
      }),
    };
  }
  return { ok: true as const, intentId };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ intentId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const identifier = await intentIdOrError(request, params);
  if (!identifier.ok) return identifier.response;
  const parsed = await parseV1Json(request, weeklyIntentPatchSchema);
  if (!parsed.ok) return parsed.response;
  if (
    parsed.data.action !== "PAUSE" &&
    !isV2FeatureEnabled("v2WeeklyIntent")
  ) {
    return unavailable(request);
  }
  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `weekly-intent-patch-v1:${identifier.intentId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 200,
        body: (await patchWeeklyIntent(
          auth.user.id,
          identifier.intentId,
          parsed.data,
        )) as unknown as Prisma.InputJsonValue,
      }),
    });
  } catch (cause) {
    if (cause instanceof WeeklyIntentError) return domainError(request, cause);
    console.error("PATCH /api/v1/me/weekly-intents/[intentId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Weekly Intent could not be updated.",
      status: 500,
      retryable: true,
    });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ intentId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const identifier = await intentIdOrError(request, params);
  if (!identifier.ok) return identifier.response;
  const parsed = await parseV1Json(request, weeklyIntentEndSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `weekly-intent-end-v1:${identifier.intentId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 200,
        body: (await endWeeklyIntent(
          auth.user.id,
          identifier.intentId,
          parsed.data.expectedVersion,
        )) as unknown as Prisma.InputJsonValue,
      }),
    });
  } catch (cause) {
    if (cause instanceof WeeklyIntentError) return domainError(request, cause);
    console.error("DELETE /api/v1/me/weekly-intents/[intentId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Weekly Intent could not be ended.",
      status: 500,
      retryable: true,
    });
  }
}
