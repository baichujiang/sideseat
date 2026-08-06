import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import {
  deleteNativeDiscoverPostComment,
  DiscoverQuestionMutationError,
} from "@/lib/api/v1/discover-question-service";
import { v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";
import { getClassmatePostDetailForViewer } from "@/lib/queries/classmate-post-detail";

export const dynamic = "force-dynamic";

const cuidSchema = z.string().cuid();

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ postId: string; commentId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { postId, commentId } = await params;
  if (!cuidSchema.safeParse(postId).success || !cuidSchema.safeParse(commentId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The question identifier is invalid.",
      status: 422,
    });
  }
  const idempotency = requireDiscoverIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;

  try {
    const detail = await getClassmatePostDetailForViewer(postId, auth.user.id);
    if (!detail.ok) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The buddy post was not found.",
        status: 404,
      });
    }
    const limited = await limitDiscoverWrite(request, auth.user.id);
    if (limited) return limited;
    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `native-discover-question-delete:${postId}:${commentId}`,
      requestHash: hashIdempotencyRequest({ postId, commentId }),
      execute: async (tx) => ({
        status: 200,
        body: (await deleteNativeDiscoverPostComment({
          userId: auth.user.id,
          postId,
          commentId,
          tx,
        })) as Prisma.InputJsonObject,
      }),
    });
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof DiscoverQuestionMutationError) {
      return v1Error(request, {
        code: cause.code === "FORBIDDEN" ? "CONTENT_RESTRICTED" : "NOT_FOUND",
        message: cause.code === "FORBIDDEN" ? "You cannot delete this question." : "The question was not found.",
        status: cause.code === "FORBIDDEN" ? 403 : 404,
      });
    }
    console.error("DELETE /api/v1/discover/posts/[postId]/questions/[commentId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The question could not be deleted.",
      status: 500,
      retryable: true,
    });
  }
}
