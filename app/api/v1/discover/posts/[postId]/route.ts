import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import {
  loadNativeDiscoverPostDetail,
  toNativeDiscoverPost,
} from "@/lib/api/v1/discover-service";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";
import {
  ClassmatePostCreateError,
  updateClassmatePostForUser,
} from "@/lib/discover/create-classmate-post";
import { prismaClassmatePostToDiscoverRow } from "@/lib/discover/prisma-classmate-post-for-discover";
import { updateClassmatePostSchema } from "@/lib/validators/classmate-posts";

export const dynamic = "force-dynamic";

const postIdSchema = z.string().cuid();

export async function GET(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { postId } = await params;
  if (!postIdSchema.safeParse(postId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The buddy post identifier is invalid.",
      status: 422,
      field: "postId",
    });
  }

  try {
    const detail = await loadNativeDiscoverPostDetail({
      userId: auth.user.id,
      postId,
    });
    if (!detail) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The buddy post was not found.",
        status: 404,
      });
    }
    return v1Success(detail, { request });
  } catch (cause) {
    console.error("GET /api/v1/discover/posts/[postId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The buddy post could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

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
      message: "The buddy post identifier is invalid.",
      status: 422,
      field: "postId",
    });
  }
  const idempotency = requireDiscoverIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;
  const parsed = await parseV1Json(request, updateClassmatePostSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const limited = await limitDiscoverWrite(request, auth.user.id);
    if (limited) return limited;
    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `native-discover-post-update:${postId}`,
      requestHash: hashIdempotencyRequest({ postId, ...parsed.data }),
      execute: async (tx) => {
        const updated = await updateClassmatePostForUser(
          auth.user,
          postId,
          parsed.data,
          tx,
        );
        const post = toNativeDiscoverPost(
          prismaClassmatePostToDiscoverRow(updated, auth.user.id, {
            savedByViewer: false,
          }),
        );
        return {
          status: 200,
          body: { post } as Prisma.InputJsonObject,
        };
      },
    });
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof ClassmatePostCreateError) {
      const notFound = cause.code === "NOT_FOUND";
      const authorOnly = cause.code === "AUTHOR_ONLY";
      const invalidState = cause.code === "INVALID_STATE";
      const courseRestricted = cause.code === "COURSE_NOT_ENROLLED";
      return v1Error(request, {
        code: notFound
          ? "NOT_FOUND"
          : authorOnly || courseRestricted
            ? "CONTENT_RESTRICTED"
            : "INVALID_REQUEST",
        message: notFound
          ? "The post was not found."
          : authorOnly
            ? "Only the author can edit this post."
            : invalidState
              ? "Only active posts can be edited."
              : courseRestricted
                ? "You can only share courses you joined."
                : cause.code === "INVALID_IMAGE"
                  ? "Upload the image again before saving the plan."
                  : "Choose a future expiry date.",
        status: notFound ? 404 : authorOnly || courseRestricted ? 403 : invalidState ? 409 : 422,
      });
    }
    console.error("PATCH /api/v1/discover/posts/[postId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The post could not be updated.",
      status: 500,
      retryable: true,
    });
  }
}
