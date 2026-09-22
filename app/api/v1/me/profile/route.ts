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
  NativeProfileUpdateError,
  nativeProfileUpdateSchema,
  updateNativeCurrentProfile,
} from "@/lib/api/v1/profile-service";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const PROFILE_WRITE_LIMIT = 20;
const PROFILE_WRITE_WINDOW_MS = 60_000;

function localeFromRequest(request: Request): "en" | "zh-CN" {
  const language = request.headers.get("accept-language")?.toLowerCase() ?? "";
  return language.startsWith("zh") ? "zh-CN" : "en";
}

export async function PATCH(request: Request) {
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

  const parsed = await parseV1Json(request, nativeProfileUpdateSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-profile-write",
      subject: rateLimitSubject(auth.user.id),
      limit: PROFILE_WRITE_LIMIT,
      windowMs: PROFILE_WRITE_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many profile changes were made. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      });
    }

    const locale = localeFromRequest(request);
    const result = await prisma.$transaction(async (tx) => {
      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const claim = await claimIdempotency(tx, {
        scope: "native-profile-update",
        actorId: auth.user.id,
        key,
        requestHash: hashIdempotencyRequest(parsed.data),
      });
      if (claim.kind !== "owner") return claim;

      const body = await updateNativeCurrentProfile({
        user: auth.user,
        locale,
        values: parsed.data,
        tx,
      });
      await completeIdempotency(tx, claim, {
        status: 200,
        body: body as Prisma.InputJsonValue,
      });
      return { kind: "updated", body } as const;
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
    return v1Success(result.body, { request });
  } catch (cause) {
    if (cause instanceof NativeProfileUpdateError) {
      if (cause.code === "PROFILE_NOT_FOUND") {
        return v1Error(request, {
          code: "NOT_FOUND",
          message: "The current profile was not found.",
          status: 404,
        });
      }
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message:
          cause.code === "NICKNAME_RESERVED"
            ? "That nickname is reserved."
            : cause.code === "NICKNAME_TAKEN"
              ? "That nickname is already taken."
              : "Choose a valid nickname.",
        status: cause.code === "NICKNAME_TAKEN" ? 409 : 422,
        field: "nickname",
      });
    }
    console.error("PATCH /api/v1/me/profile", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The profile could not be updated.",
      status: 500,
      retryable: true,
    });
  }
}
