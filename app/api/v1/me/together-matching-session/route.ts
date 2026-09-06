import type { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import { matchAndNotifyForUser } from "@/lib/v2/mutual-opportunity-auto-match";
import {
  loadTogetherMatchingSession,
  startTogetherMatchingSession,
  stopTogetherMatchingSession,
  TogetherMatchingSessionError,
} from "@/lib/v2/together-matching-session";

export const dynamic = "force-dynamic";

function unavailable(request: Request) {
  return v1Error(request, {
    code: "FEATURE_UNAVAILABLE",
    message: "Together matching is not available.",
    status: 404,
  });
}

function enabled() {
  return (
    isV2FeatureEnabled("v2WeeklyIntent") &&
    isV2FeatureEnabled("v2MutualOpportunity")
  );
}

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!enabled()) return unavailable(request);

  try {
    return v1Success(await loadTogetherMatchingSession(auth.user.id), {
      request,
    });
  } catch (cause) {
    console.error("GET /api/v1/me/together-matching-session", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Together matching status could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!enabled()) return unavailable(request);

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: "together-matching-session-start-v1",
      requestBody: { action: "start", durationHours: 48 },
      execute: async () => {
        const session = await startTogetherMatchingSession(auth.user.id);
        await matchAndNotifyForUser(auth.user.id);
        return {
          status: 200,
          body: session as unknown as Prisma.InputJsonValue,
        };
      },
    });
  } catch (cause) {
    if (cause instanceof TogetherMatchingSessionError) {
      return v1Error(request, {
        code: "STATE_CONFLICT",
        message: "Add at least one active intention before starting matching.",
        status: 409,
      });
    }
    console.error("POST /api/v1/me/together-matching-session", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Together matching could not be started.",
      status: 500,
      retryable: true,
    });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!enabled()) return unavailable(request);

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: "together-matching-session-stop-v1",
      requestBody: { action: "stop" },
      execute: async () => ({
        status: 200,
        body: (await stopTogetherMatchingSession(
          auth.user.id,
        )) as unknown as Prisma.InputJsonValue,
      }),
    });
  } catch (cause) {
    console.error("DELETE /api/v1/me/together-matching-session", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Together matching could not be stopped.",
      status: 500,
      retryable: true,
    });
  }
}
