import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import {
  NativeDiscoverPostStatusError,
  setNativeDiscoverPostStatus,
} from "@/lib/api/v1/discover-service";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";

export const dynamic = "force-dynamic";

const postIdSchema = z.string().cuid();
const requestSchema = z.object({ status: z.literal("CLOSED") });

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { postId } = await params;
  if (!postIdSchema.safeParse(postId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The post identifier is invalid.",
      status: 422,
      field: "postId",
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
      scope: `native-discover-post-status:${parsed.data.status}:${postId}`,
      requestHash: hashIdempotencyRequest({ postId, status: parsed.data.status }),
      execute: async (tx) => {
        const post = await setNativeDiscoverPostStatus({
          userId: auth.user.id,
          postId,
          status: parsed.data.status,
          tx,
        });
        return {
          status: 200,
          body: { post } as Prisma.InputJsonObject,
        };
      },
    });
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof NativeDiscoverPostStatusError) {
      return v1Error(request, {
        code: cause.code === "NOT_FOUND" ? "NOT_FOUND" : "CONTENT_RESTRICTED",
        message:
          cause.code === "NOT_FOUND"
            ? "The post was not found."
            : "Only the author can close this post.",
        status: cause.code === "NOT_FOUND" ? 404 : 403,
      });
    }
    console.error("PATCH /api/v1/discover/posts/[postId]/status", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The post status could not be changed.",
      status: 500,
      retryable: true,
    });
  }
}
