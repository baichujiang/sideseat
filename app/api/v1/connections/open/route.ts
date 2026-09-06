import { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  claimIdempotency,
  completeIdempotency,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from "@/lib/api/v1/idempotency";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import {
  consumeV1RateLimit,
  rateLimitHeaders,
  rateLimitSubject,
} from "@/lib/api/v1/rate-limit";
import {
  OpenConversationError,
  openConversationForUser,
} from "@/lib/connections/open-conversation";
import { prisma } from "@/lib/db/prisma";
import { openConversationSchema } from "@/lib/validators/invitation";

export const dynamic = "force-dynamic";

const OPEN_CONVERSATION_LIMIT = 20;
const OPEN_CONVERSATION_WINDOW_MS = 60_000;

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

  const parsed = await parseV1Json(request, openConversationSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-connection-open",
      subject: rateLimitSubject(auth.user.id),
      limit: OPEN_CONVERSATION_LIMIT,
      windowMs: OPEN_CONVERSATION_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many conversations were opened. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const claim = await claimIdempotency(tx, {
        scope: "native-connection-open",
        actorId: auth.user.id,
        key,
        requestHash: hashIdempotencyRequest(parsed.data),
      });
      if (claim.kind !== "owner") return claim;

      const opened = await openConversationForUser(auth.user, parsed.data, tx);
      const body = {
        connectionId: opened.connectionId,
        created: opened.created,
        peerId: parsed.data.peerId,
      };
      await completeIdempotency(tx, claim, {
        status: opened.created ? 201 : 200,
        body: body as Prisma.InputJsonValue,
      });
      return { kind: "opened", status: opened.created ? 201 : 200, body } as const;
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
    return v1Success(result.body, { request, status: result.status });
  } catch (cause) {
    if (cause instanceof OpenConversationError) {
      switch (cause.code) {
        case "PEER_UNAVAILABLE":
          return v1Error(request, {
            code: "NOT_FOUND",
            message: "That person is not available.",
            status: 404,
            field: "peerId",
          });
        case "CROSS_SCHOOL":
          return v1Error(request, {
            code: "CONTENT_RESTRICTED",
            message: "Cross-school messages are not available yet.",
            status: 403,
            field: "peerId",
          });
        case "CONTENT_RESTRICTED":
          return v1Error(request, {
            code: "CONTENT_RESTRICTED",
            message: "This user is unavailable for contact.",
            status: 403,
            field: "peerId",
          });
        case "CONVERSATION_ENDED":
          return v1Error(request, {
            code: "INVALID_REQUEST",
            message: "This conversation is no longer available.",
            status: 409,
            field: "peerId",
          });
        case "COURSE_CONTEXT_INVALID":
          return v1Error(request, {
            code: "CONTENT_RESTRICTED",
            message: "That course context is no longer valid.",
            status: 403,
            field: "courseId",
          });
        case "POST_CONTEXT_INVALID":
          return v1Error(request, {
            code: "CONTENT_RESTRICTED",
            message: "That plan is no longer available for contact.",
            status: 403,
            field: "postId",
          });
        case "ACTION_COORDINATION_REQUIRED":
          return v1Error(request, {
            code: "INVALID_REQUEST",
            message: "Respond from the action page to contact its creator.",
            status: 409,
            field: "postId",
          });
        case "RATE_LIMITED":
          return v1Error(request, {
            code: "RATE_LIMITED",
            message: "You've started too many new chats recently. Try again in a bit.",
            status: 429,
            retryable: true,
          });
      }
    }
    console.error("POST /api/v1/connections/open", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The conversation could not be opened.",
      status: 500,
      retryable: true,
    });
  }
}
