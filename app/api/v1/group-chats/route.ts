import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  GroupChatManageError,
  createGroupChat,
} from "@/lib/api/v1/group-chat-manage-service";
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
import { prisma } from "@/lib/db/prisma";
import { groupChatCreateSchema } from "@/lib/validators/chat-directory";

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

  const parsed = await parseV1Json(request, groupChatCreateSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-group-create",
      subject: rateLimitSubject(auth.user.id),
      limit: 20,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many groups were created. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const claim = await claimIdempotency(tx, {
        scope: "native-group-create",
        actorId: auth.user.id,
        key,
        requestHash: hashIdempotencyRequest(parsed.data),
      });
      if (claim.kind !== "owner") return claim;

      const created = await createGroupChat({
        userId: auth.user.id,
        title: parsed.data.title,
        participantIds: parsed.data.participantIds,
      });
      await completeIdempotency(tx, claim, {
        status: 201,
        body: created as unknown as Prisma.InputJsonValue,
      });
      return { kind: "completed" as const, status: 201, body: created };
    });

    if (result.kind === "conflict") {
      return v1Error(request, {
        code: "IDEMPOTENCY_CONFLICT",
        message: "Idempotency key was reused with a different body.",
        status: 409,
      });
    }
    if (result.kind === "in_progress") {
      return v1Error(request, {
        code: "REQUEST_IN_PROGRESS",
        message: "The same request is still in progress.",
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
    if (cause instanceof GroupChatManageError) {
      return v1Error(request, {
        code: cause.code === "CONTENT_RESTRICTED" ? "CONTENT_RESTRICTED" : "INVALID_REQUEST",
        message: cause.messageText,
        status: cause.code === "CONTENT_RESTRICTED" ? 403 : 422,
      });
    }
    if (cause instanceof z.ZodError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: cause.issues[0]?.message ?? "Invalid request.",
        status: 422,
      });
    }
    console.error("POST /api/v1/group-chats", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The group chat could not be created.",
      status: 500,
      retryable: true,
    });
  }
}
