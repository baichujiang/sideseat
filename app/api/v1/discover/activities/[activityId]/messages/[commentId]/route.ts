import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  deleteNativeDiscoverActivityMessage,
  DiscoverActivityMessageMutationError,
} from "@/lib/api/v1/discover-activity-message-service";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import { loadNativeDiscoverActivityDetail } from "@/lib/api/v1/discover-service";
import { v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";

export const dynamic = "force-dynamic";

const cuidSchema = z.string().cuid();

export async function DELETE(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ activityId: string; commentId: string }>;
  },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { activityId, commentId } = await params;
  if (
    !cuidSchema.safeParse(activityId).success ||
    !cuidSchema.safeParse(commentId).success
  ) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The message identifier is invalid.",
      status: 422,
    });
  }
  const idempotency = requireDiscoverIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  try {
    const detail = await loadNativeDiscoverActivityDetail({
      userId: auth.user.id,
      activityId,
    });
    if (!detail) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The plan was not found.",
        status: 404,
      });
    }
    const limited = await limitDiscoverWrite(request, auth.user.id);
    if (limited) return limited;

    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `native-discover-activity-message-delete:${activityId}:${commentId}`,
      requestHash: hashIdempotencyRequest({ activityId, commentId }),
      execute: async (tx) => ({
        status: 200,
        body: (await deleteNativeDiscoverActivityMessage({
          userId: auth.user.id,
          activityId,
          commentId,
          tx,
        })) as Prisma.InputJsonObject,
      }),
    });
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof DiscoverActivityMessageMutationError) {
      return v1Error(request, {
        code:
          cause.code === "FORBIDDEN"
            ? "CONTENT_RESTRICTED"
            : "NOT_FOUND",
        message:
          cause.code === "FORBIDDEN"
            ? "You cannot delete this message."
            : "The message was not found.",
        status: cause.code === "FORBIDDEN" ? 403 : 404,
      });
    }
    console.error(
      "DELETE /api/v1/discover/activities/[activityId]/messages/[commentId]",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The message could not be deleted.",
      status: 500,
      retryable: true,
    });
  }
}
