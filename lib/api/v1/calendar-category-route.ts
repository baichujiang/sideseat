import "server-only";

import { Prisma } from "@prisma/client";

import { v1Error, v1Success } from "@/lib/api/v1/http";
import { readIdempotencyKey } from "@/lib/api/v1/idempotency";
import type { V1MutationResult } from "@/lib/api/v1/mutation";
import {
  consumeV1RateLimit,
  rateLimitHeaders,
  rateLimitSubject,
} from "@/lib/api/v1/rate-limit";
import {
  BuiltInCalendarSubscriptionError,
  CalendarCategoryNotFoundError,
  InvalidCalendarSubscriptionError,
} from "@/lib/calendar/calendar-category-service";

const CATEGORY_WRITE_LIMIT = 30;
const CATEGORY_WRITE_WINDOW_MS = 60_000;

export function requireCalendarCategoryIdempotencyKey(request: Request) {
  const key = readIdempotencyKey(request);
  if (key) return { ok: true as const, key };
  return {
    ok: false as const,
    response: v1Error(request, {
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "A valid Idempotency-Key header is required.",
      status: 422,
      field: "Idempotency-Key",
    }),
  };
}

export async function limitCalendarCategoryWrite(request: Request, userId: string) {
  const result = await consumeV1RateLimit({
    scope: "native-calendar-category-write",
    subject: rateLimitSubject(userId),
    limit: CATEGORY_WRITE_LIMIT,
    windowMs: CATEGORY_WRITE_WINDOW_MS,
  });
  if (result.allowed) return null;
  return v1Error(request, {
    code: "RATE_LIMITED",
    message: "Too many calendar changes were made. Try again shortly.",
    status: 429,
    retryable: true,
    headers: rateLimitHeaders(result),
  });
}

export function calendarCategoryMutationResponse<T extends Prisma.InputJsonValue>(
  request: Request,
  result: V1MutationResult<T>,
) {
  switch (result.kind) {
    case "completed":
      return v1Success(result.body, { request, status: result.status });
    case "not_found":
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The calendar was not found.",
        status: 404,
      });
    case "conflict":
      return v1Error(request, {
        code: "IDEMPOTENCY_CONFLICT",
        message: "This Idempotency-Key was already used for another request.",
        status: 409,
      });
    case "in_progress":
      return v1Error(request, {
        code: "REQUEST_IN_PROGRESS",
        message: "The matching request is still being processed.",
        status: 409,
        retryable: true,
        headers: { "Retry-After": "1" },
      });
    case "replay":
      return v1Success(result.body, {
        request,
        status: result.status,
        headers: { "Idempotency-Replayed": "true" },
      });
  }
}

export function calendarCategoryDomainError(request: Request, cause: unknown) {
  if (cause instanceof CalendarCategoryNotFoundError) {
    return v1Error(request, {
      code: "NOT_FOUND",
      message: "The calendar was not found.",
      status: 404,
    });
  }
  if (cause instanceof BuiltInCalendarSubscriptionError) {
    return v1Error(request, {
      code: "BUILT_IN_CALENDAR",
      message: "Subscription feeds can only be used on custom calendars.",
      status: 409,
      field: "icsSubscriptionUrl",
    });
  }
  if (cause instanceof InvalidCalendarSubscriptionError) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: cause.message,
      status: 422,
      field: "icsSubscriptionUrl",
    });
  }
  return null;
}
