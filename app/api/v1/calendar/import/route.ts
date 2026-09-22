import { Prisma } from "@prisma/client";
import { z } from "zod";

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
import {
  CalendarIcsImportError,
  MAX_ICS_IMPORT_BYTES,
  persistCalendarIcsImport,
  prepareCalendarIcsImport,
} from "@/lib/calendar/import-ics-events";
import { prisma } from "@/lib/db/prisma";

export const dynamic = "force-dynamic";

const importSchema = z.object({
  ics: z.string().min(1).max(MAX_ICS_IMPORT_BYTES),
});

const WRITE_LIMIT = 5;
const WRITE_WINDOW_MS = 60_000;

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) {
    return v1Error(request, {
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "A valid Idempotency-Key header is required.",
      status: 422,
      field: "Idempotency-Key",
    });
  }

  const parsed = await parseV1Json(request, importSchema);
  if (!parsed.ok) return parsed.response;

  let prepared: ReturnType<typeof prepareCalendarIcsImport>;
  try {
    prepared = prepareCalendarIcsImport(parsed.data.ics);
  } catch (cause) {
    if (cause instanceof CalendarIcsImportError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: cause.message,
        status: 422,
        field: "ics",
      });
    }
    console.error("POST /api/v1/calendar/import parse", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The calendar could not be read.",
      status: 500,
      retryable: true,
    });
  }

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-calendar-import",
      subject: rateLimitSubject(auth.user.id),
      limit: WRITE_LIMIT,
      windowMs: WRITE_WINDOW_MS,
    });
    if (!rateLimit.allowed) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many calendar imports were requested. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const claim = await claimIdempotency(tx, {
        scope: "native-calendar-import",
        actorId: auth.user.id,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest(parsed.data),
      });
      if (claim.kind !== "owner") return claim;

      const body = await persistCalendarIcsImport(tx, auth.user.id, prepared);
      await completeIdempotency(tx, claim, {
        status: 201,
        body: body as Prisma.InputJsonValue,
      });
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
    console.error("POST /api/v1/calendar/import", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The calendar could not be imported.",
      status: 500,
      retryable: true,
    });
  }
}
