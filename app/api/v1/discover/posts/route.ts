import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import {
  claimIdempotency,
  completeIdempotency,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from "@/lib/api/v1/idempotency";
import {
  consumeV1RateLimit,
  rateLimitHeaders,
  rateLimitSubject,
} from "@/lib/api/v1/rate-limit";
import { prisma } from "@/lib/db/prisma";
import {
  ClassmatePostCreateError,
  createClassmatePostForUser,
} from "@/lib/discover/create-classmate-post";
import { isDiscoverServedCity } from "@/lib/discover/discover-served-cities";
import { createClassmatePostSchema } from "@/lib/validators/classmate-posts";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const key = readIdempotencyKey(request);
  if (!key) {
    return v1Error(request, {
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "A valid Idempotency-Key header is required.",
      status: 422,
      field: "Idempotency-Key",
    });
  }
  const parsed = await parseV1Json(request, createClassmatePostSchema);
  if (!parsed.ok) return parsed.response;
  const values = createClassmatePostSchema.parse(parsed.data);
  if (!isDiscoverServedCity(values.city)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "Choose a supported Discover city.",
      status: 422,
      field: "city",
    });
  }

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-discover-post-create",
      subject: rateLimitSubject(auth.user.id),
      limit: 10,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many plans were created. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotency(tx, {
        scope: "native-discover-post-create",
        actorId: auth.user.id,
        key,
        requestHash: hashIdempotencyRequest(values),
      });
      if (claim.kind !== "owner") return claim;
      const post = await createClassmatePostForUser(auth.user, values, tx);
      const body = {
        postId: post.id,
        status: post.status,
        expiresAt: post.expiresAt.toISOString(),
      };
      await completeIdempotency(tx, claim, { status: 201, body });
      return { kind: "created", body } as const;
    });
    if (result.kind === "conflict") {
      return v1Error(request, {
        code: "IDEMPOTENCY_CONFLICT",
        message: "This Idempotency-Key was already used for another request.",
        status: 409,
      });
    }
    if (result.kind === "in_progress") {
      return v1Error(request, {
        code: "REQUEST_IN_PROGRESS",
        message: "The matching request is still being processed.",
        status: 409,
        retryable: true,
        headers: { "Retry-After": "1" },
      });
    }
    if (result.kind === "replay") {
      return v1Success(result.body, {
        request,
        status: result.status,
        headers: { "Idempotency-Replayed": "true" },
      });
    }
    return v1Success(result.body, { request, status: 201 });
  } catch (cause) {
    if (cause instanceof ClassmatePostCreateError) {
      const field = cause.code.includes("EXPIRY") ? "expiresAt" : undefined;
      const message =
        cause.code === "CREATE_LIMIT"
          ? "You already have the maximum number of live plans."
          : cause.code === "INVALID_IMAGE"
            ? "Upload the image again before creating the plan."
          : cause.code === "COURSE_NOT_ENROLLED"
            ? "You can only share courses you joined."
            : "Choose a future expiry date.";
      return v1Error(request, {
        code:
          cause.code === "COURSE_NOT_ENROLLED"
            ? "CONTENT_RESTRICTED"
            : "INVALID_REQUEST",
        message,
        status: cause.code === "COURSE_NOT_ENROLLED" ? 403 : 422,
        field: cause.code === "INVALID_IMAGE" ? "imageUrls" : field,
      });
    }
    console.error("POST /api/v1/discover/posts", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The plan could not be created.",
      status: 500,
      retryable: true,
    });
  }
}
