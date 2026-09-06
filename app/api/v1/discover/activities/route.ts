import { Prisma } from "@prisma/client";

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
  DiscoverActivityCreateError,
  createDiscoverActivityForUser,
} from "@/lib/discover/create-discover-activity";
import {
  DEFAULT_DISCOVER_SERVED_CITY,
  isDiscoverServedCity,
} from "@/lib/discover/discover-served-cities";
import { createDiscoverActivitySchema } from "@/lib/validators/discover-activity";

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
  const parsed = await parseV1Json(request, createDiscoverActivitySchema);
  if (!parsed.ok) return parsed.response;
  const values = createDiscoverActivitySchema.parse(parsed.data);
  const city = values.city ?? DEFAULT_DISCOVER_SERVED_CITY;
  if (!isDiscoverServedCity(city)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "Choose a supported Discover city.",
      status: 422,
      field: "city",
    });
  }
  const normalizedValues = { ...values, city };

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-discover-activity-create",
      subject: rateLimitSubject(auth.user.id),
      limit: 10,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many activities were created. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotency(tx, {
        scope: "native-discover-activity-create",
        actorId: auth.user.id,
        key,
        requestHash: hashIdempotencyRequest(values),
      });
      if (claim.kind !== "owner") return claim;
      const activity = await createDiscoverActivityForUser(
        auth.user,
        normalizedValues,
        city,
        tx,
      );
      const body = { activityId: activity.id, status: activity.status, phase: activity.phase };
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
    if (cause instanceof DiscoverActivityCreateError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "You already have the maximum number of upcoming activities.",
        status: 422,
      });
    }
    console.error("POST /api/v1/discover/activities", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The activity could not be created.",
      status: 500,
      retryable: true,
    });
  }
}
