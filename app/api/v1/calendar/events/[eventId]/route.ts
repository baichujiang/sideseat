import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  deleteCalendarEventForUser,
  InvalidCalendarCategoryError,
  InvalidCalendarCompanionsError,
  type CalendarDeleteScope,
  type CalendarUpdateScope,
  updateCalendarEventForUser,
} from "@/lib/api/v1/calendar-event-service";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import {
  claimIdempotency,
  completeIdempotency,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from "@/lib/api/v1/idempotency";
import { prisma } from "@/lib/db/prisma";
import { calendarEventSchema, type CalendarEventInput } from "@/lib/validators/calendar";

export const dynamic = "force-dynamic";

const eventIdSchema = z.string().cuid();
const mutationScopeSchema = z.enum(["this", "future", "all"]);

function missingIdempotencyKey(request: Request) {
  return v1Error(request, {
    code: "IDEMPOTENCY_KEY_REQUIRED",
    message: "A valid Idempotency-Key header is required.",
    status: 422,
    field: "Idempotency-Key",
  });
}

function claimResponse(
  request: Request,
  claim:
    | { kind: "conflict" }
    | { kind: "in_progress" }
    | { kind: "replay"; status: number; body: Prisma.JsonValue },
) {
  if (claim.kind === "conflict") {
    return v1Error(request, {
      code: "IDEMPOTENCY_CONFLICT",
      message: "This Idempotency-Key was already used for another request.",
      status: 409,
    });
  }
  if (claim.kind === "in_progress") {
    return v1Error(request, {
      code: "REQUEST_IN_PROGRESS",
      message: "The matching request is still being processed.",
      status: 409,
      retryable: true,
      headers: { "Retry-After": "1" },
    });
  }
  return v1Success(claim.body, {
    request,
    status: claim.status,
    headers: { "Idempotency-Replayed": "true" },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { eventId } = await params;
  if (!eventIdSchema.safeParse(eventId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The event identifier is invalid.",
      status: 422,
      field: "eventId",
    });
  }
  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) return missingIdempotencyKey(request);
  const parsed = await parseV1Json(request, calendarEventSchema);
  if (!parsed.ok) return parsed.response;
  const values = parsed.data as CalendarEventInput;
  const rawScope = new URL(request.url).searchParams.get("scope") ?? "this";
  const parsedScope = mutationScopeSchema.safeParse(rawScope);
  if (!parsedScope.success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "scope must be this, future, or all.",
      status: 422,
      field: "scope",
    });
  }
  const scope: CalendarUpdateScope = parsedScope.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotency(tx, {
        scope: `native-calendar-event-update:${eventId}`,
        actorId: auth.user.id,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ values, scope }),
      });
      if (claim.kind !== "owner") return claim;
      const updated = await updateCalendarEventForUser(tx, {
        eventId,
        userId: auth.user.id,
        values,
        scope,
      });
      if (!updated) {
        await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
        return { kind: "not_found" } as const;
      }
      const body = updated;
      await completeIdempotency(tx, claim, {
        status: 200,
        body: body as Prisma.InputJsonValue,
      });
      return { kind: "updated", body } as const;
    });
    if (result.kind === "not_found") {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The calendar event was not found.",
        status: 404,
      });
    }
    if (result.kind !== "updated") return claimResponse(request, result);
    return v1Success(result.body, { request });
  } catch (cause) {
    if (cause instanceof InvalidCalendarCompanionsError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Some selected classmates can no longer be added.",
        status: 422,
        field: "withUserIds",
      });
    }
    if (cause instanceof InvalidCalendarCategoryError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: "Choose a valid calendar category.",
        status: 422,
        field: "categoryId",
      });
    }
    console.error("PATCH /api/v1/calendar/events/[eventId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The calendar event could not be updated.",
      status: 500,
      retryable: true,
    });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ eventId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { eventId } = await params;
  if (!eventIdSchema.safeParse(eventId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The event identifier is invalid.",
      status: 422,
      field: "eventId",
    });
  }
  const idempotencyKey = readIdempotencyKey(request);
  if (!idempotencyKey) return missingIdempotencyKey(request);
  const rawScope = new URL(request.url).searchParams.get("scope") ?? "this";
  const parsedScope = mutationScopeSchema.safeParse(rawScope);
  if (!parsedScope.success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "scope must be this, future, or all.",
      status: 422,
      field: "scope",
    });
  }
  const scope: CalendarDeleteScope = parsedScope.data;

  try {
    const result = await prisma.$transaction(async (tx) => {
      const claim = await claimIdempotency(tx, {
        scope: `native-calendar-event-delete:${eventId}`,
        actorId: auth.user.id,
        key: idempotencyKey,
        requestHash: hashIdempotencyRequest({ eventId, scope }),
      });
      if (claim.kind !== "owner") return claim;
      const deleted = await deleteCalendarEventForUser(tx, {
        eventId,
        userId: auth.user.id,
        scope,
      });
      if (!deleted) {
        await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
        return { kind: "not_found" } as const;
      }
      await completeIdempotency(tx, claim, {
        status: 200,
        body: deleted as Prisma.InputJsonValue,
      });
      return { kind: "deleted", body: deleted } as const;
    });
    if (result.kind === "not_found") {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The calendar event was not found.",
        status: 404,
      });
    }
    if (result.kind !== "deleted") return claimResponse(request, result);
    return v1Success(result.body, { request });
  } catch (cause) {
    console.error("DELETE /api/v1/calendar/events/[eventId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The calendar event could not be deleted.",
      status: 500,
      retryable: true,
    });
  }
}
