import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import {
  NativeDiscoverActivityStatusError,
  setNativeDiscoverActivityStatus,
} from "@/lib/api/v1/discover-service";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";

export const dynamic = "force-dynamic";

const activityIdSchema = z.string().cuid();
const requestSchema = z.object({
  status: z.enum(["CLOSED", "CANCELED"]),
});

export async function PATCH(
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
  const parsed = await parseV1Json(request, requestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const limited = await limitDiscoverWrite(request, auth.user.id);
    if (limited) return limited;
    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `native-discover-activity-status:${parsed.data.status}:${activityId}`,
      requestHash: hashIdempotencyRequest({
        activityId,
        status: parsed.data.status,
      }),
      execute: async (tx) => {
        const activity = await setNativeDiscoverActivityStatus({
          user: auth.user,
          activityId,
          status: parsed.data.status,
          tx,
        });
        return {
          status: 200,
          body: { activity } as Prisma.InputJsonObject,
        };
      },
    });
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof NativeDiscoverActivityStatusError) {
      return v1Error(request, {
        code: cause.code === "NOT_FOUND" ? "NOT_FOUND" : "CONTENT_RESTRICTED",
        message:
          cause.code === "NOT_FOUND"
            ? "The activity was not found."
            : "Only the organizer can change this activity.",
        status: cause.code === "NOT_FOUND" ? 404 : 403,
      });
    }
    console.error(
      "PATCH /api/v1/discover/activities/[activityId]/status",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The activity status could not be changed.",
      status: 500,
      retryable: true,
    });
  }
}
