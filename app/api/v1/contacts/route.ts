import { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  ContactsServiceError,
  addContact,
  listAcceptedContacts,
} from "@/lib/api/v1/contacts-service";
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
import { contactAddSchema } from "@/lib/validators/chat-directory";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const contacts = await listAcceptedContacts(auth.user.id);
  return v1Success({ contacts }, { request });
}

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

  const parsed = await parseV1Json(request, contactAddSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const rateLimit = await consumeV1RateLimit({
      scope: "native-contacts-add",
      subject: rateLimitSubject(auth.user.id),
      limit: 30,
      windowMs: 60_000,
    });
    if (!rateLimit.allowed) {
      return v1Error(request, {
        code: "RATE_LIMITED",
        message: "Too many contact adds. Try again shortly.",
        status: 429,
        retryable: true,
        headers: rateLimitHeaders(rateLimit),
      });
    }

    const result = await prisma.$transaction(async (tx) => {
      await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
      const claim = await claimIdempotency(tx, {
        scope: "native-contacts-add",
        actorId: auth.user.id,
        key,
        requestHash: hashIdempotencyRequest(parsed.data),
      });
      if (claim.kind !== "owner") return claim;

      const added = await addContact({
        userId: auth.user.id,
        peerId: parsed.data.peerId,
      });
      const body = {
        connectionId: added.connectionId,
        created: added.created,
      };
      await completeIdempotency(tx, claim, {
        status: added.created ? 201 : 200,
        body: body as Prisma.InputJsonValue,
      });
      return { kind: "completed" as const, status: added.created ? 201 : 200, body };
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
    if (cause instanceof ContactsServiceError) {
      const map = {
        NOT_FOUND: {
          code: "NOT_FOUND" as const,
          message: "That user is not available.",
          status: 404,
        },
        CONTENT_RESTRICTED: {
          code: "CONTENT_RESTRICTED" as const,
          message: "This user is unavailable for contact.",
          status: 403,
        },
        INVALID_REQUEST: {
          code: "INVALID_REQUEST" as const,
          message: "You are already in your own notes chat.",
          status: 422,
        },
        CONFLICT: {
          code: "INVALID_REQUEST" as const,
          message: "This conversation is no longer available.",
          status: 409,
        },
      }[cause.code];
      return v1Error(request, map);
    }
    console.error("POST /api/v1/contacts", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The contact could not be added.",
      status: 500,
      retryable: true,
    });
  }
}
