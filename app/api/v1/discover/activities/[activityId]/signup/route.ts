import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import { setNativeDiscoverActivitySignup } from "@/lib/api/v1/discover-service";
import { v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";
import {
  discoverActivityErrorMessage,
  discoverActivityErrorStatus,
} from "@/lib/discover/discover-activity-api-messages";
import { DiscoverActivitySignupError } from "@/lib/discover/discover-activity-signup-service";

export const dynamic = "force-dynamic";

const activityIdSchema = z.string().cuid();

function signupError(request: Request, cause: DiscoverActivitySignupError) {
  if (cause.code === "NOT_FOUND") {
    return v1Error(request, {
      code: "NOT_FOUND",
      message: "The activity was not found.",
      status: 404,
    });
  }
  const status = discoverActivityErrorStatus(cause.code);
  return v1Error(request, {
    code:
      status === 403
        ? "CONTENT_RESTRICTED"
        : status === 409 || status === 404
          ? "INVALID_REQUEST"
          : "INVALID_REQUEST",
    message: discoverActivityErrorMessage(cause.code),
    status,
  });
}

async function mutate(request: Request, activityId: string, going: boolean) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!activityIdSchema.safeParse(activityId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The activity identifier is invalid.",
      status: 422,
      field: "activityId",
    });
  }
  const idempotency = requireDiscoverIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  try {
    const limited = await limitDiscoverWrite(request, auth.user.id);
    if (limited) return limited;
    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `native-discover-activity-signup:${going ? "going" : "cancel"}:${activityId}`,
      requestHash: hashIdempotencyRequest({ activityId, going }),
      execute: async (tx) => {
        const activity = await setNativeDiscoverActivitySignup({
          user: auth.user,
          activityId,
          going,
          tx,
        });
        return {
          status: going ? 201 : 200,
          body: { activity } as Prisma.InputJsonObject,
        };
      },
    });
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof DiscoverActivitySignupError) {
      return signupError(request, cause);
    }
    console.error(
      `${request.method} /api/v1/discover/activities/[activityId]/signup`,
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The activity signup could not be changed.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  return mutate(request, (await params).activityId, true);
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  return mutate(request, (await params).activityId, false);
}
