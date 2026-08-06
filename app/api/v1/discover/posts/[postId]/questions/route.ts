import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import {
  createNativeDiscoverPostComment,
  DiscoverQuestionMutationError,
  loadNativeDiscoverPostQuestions,
} from "@/lib/api/v1/discover-question-service";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";
import { getClassmatePostDetailForViewer } from "@/lib/queries/classmate-post-detail";

export const dynamic = "force-dynamic";

const postIdSchema = z.string().cuid();
const questionWriteSchema = z.object({
  body: z.string().trim().min(1).max(500),
  parentId: z.string().cuid().optional(),
});

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
    const payload = await loadNativeDiscoverPostQuestions({
      userId: auth.user.id,
      postId,
    });
    if (!payload) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The buddy post was not found.",
        status: 404,
      });
    }
    return v1Success(payload, { request });
  } catch (cause) {
    console.error("GET /api/v1/discover/posts/[postId]/questions", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The questions could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(
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
  const parsed = await parseV1Json(request, questionWriteSchema);
  if (!parsed.ok) return parsed.response;
  const values = questionWriteSchema.parse(parsed.data);

  try {
    const detail = await getClassmatePostDetailForViewer(postId, auth.user.id);
    if (!detail.ok) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The buddy post was not found.",
        status: 404,
      });
    }
    if (values.parentId && !detail.isAuthor) {
      return v1Error(request, {
        code: "CONTENT_RESTRICTED",
        message: "Only the post author can answer a question.",
        status: 403,
      });
    }
    const limited = await limitDiscoverWrite(request, auth.user.id);
    if (limited) return limited;

    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `native-discover-question-create:${postId}`,
      requestHash: hashIdempotencyRequest({ postId, ...values }),
      execute: async (tx) => ({
        status: 201,
        body: (await createNativeDiscoverPostComment({
          userId: auth.user.id,
          postId,
          body: values.body,
          parentId: values.parentId,
          tx,
        })) as Prisma.InputJsonObject,
      }),
    });
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002"
    ) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "This question already has an answer.",
        status: 409,
      });
    }
    if (cause instanceof DiscoverQuestionMutationError) {
      const status = cause.code === "AUTHOR_ONLY" || cause.code === "FORBIDDEN" ? 403 : cause.code === "ALREADY_ANSWERED" ? 409 : 404;
      return v1Error(request, {
        code: cause.code === "ALREADY_ANSWERED" ? "INVALID_REQUEST" : cause.code === "NOT_FOUND" ? "NOT_FOUND" : "CONTENT_RESTRICTED",
        message: cause.code === "ALREADY_ANSWERED" ? "This question already has an answer." : cause.code === "NOT_FOUND" ? "The question was not found." : "Only the post author can answer a question.",
        status,
      });
    }
    console.error("POST /api/v1/discover/posts/[postId]/questions", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The question could not be posted.",
      status: 500,
      retryable: true,
    });
  }
}
