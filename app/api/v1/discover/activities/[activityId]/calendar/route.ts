import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import {
  addNativeDiscoverActivityToCalendar,
  NativeDiscoverActivityCalendarError,
} from "@/lib/api/v1/discover-service";
import { v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";

export const dynamic = "force-dynamic";

const activityIdSchema = z.string().cuid();

export async function POST(
  request: Request,
  { params }: { params: Promise<{ activityId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const { activityId } = await params;
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
      scope: `native-discover-activity-calendar:${activityId}`,
      requestHash: hashIdempotencyRequest({ activityId }),
      execute: async (tx) => {
        const data = await addNativeDiscoverActivityToCalendar({
          userId: auth.user.id,
          activityId,
          tx,
        });
        return {
          status: data.created ? 201 : 200,
          body: data as unknown as Prisma.InputJsonObject,
        };
      },
    });
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof NativeDiscoverActivityCalendarError) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The activity was not found.",
        status: 404,
      });
    }
    console.error(
      "POST /api/v1/discover/activities/[activityId]/calendar",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The activity could not be added to the calendar.",
      status: 500,
      retryable: true,
    });
  }
}
