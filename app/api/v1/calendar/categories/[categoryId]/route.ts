import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  calendarCategoryDomainError,
  calendarCategoryMutationResponse,
  limitCalendarCategoryWrite,
  requireCalendarCategoryIdempotencyKey,
} from "@/lib/api/v1/calendar-category-route";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";
import {
  CalendarCategoryNotFoundError,
  deleteCalendarCategoryForUser,
  normalizeCalendarCategoryPatchInput,
  updateCalendarCategoryForUser,
} from "@/lib/calendar/calendar-category-service";
import { calendarCategoryPatchSchema } from "@/lib/validators/calendar";

export const dynamic = "force-dynamic";

const categoryIdSchema = z.string().cuid();

async function context(request: Request, categoryId: string) {
  const auth = await requireV1User(request);
  if (!auth.ok) return { ok: false as const, response: auth.response };
  if (!categoryIdSchema.safeParse(categoryId).success) {
    return {
      ok: false as const,
      response: v1Error(request, {
        code: "INVALID_REQUEST",
        message: "The calendar identifier is invalid.",
        status: 422,
        field: "categoryId",
      }),
    };
  }
  const idempotency = requireCalendarCategoryIdempotencyKey(request);
  if (!idempotency.ok) return idempotency;
  const limited = await limitCalendarCategoryWrite(request, auth.user.id);
  if (limited) return { ok: false as const, response: limited };
  return { ok: true as const, userId: auth.user.id, key: idempotency.key };
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  const { categoryId } = await params;
  const mutationContext = await context(request, categoryId);
  if (!mutationContext.ok) return mutationContext.response;
  const parsed = await parseV1Json(request, calendarCategoryPatchSchema);
  if (!parsed.ok) return parsed.response;
  if (Object.values(parsed.data).every((value) => value === undefined)) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "At least one calendar field must be changed.",
      status: 422,
    });
  }

  try {
    const input = normalizeCalendarCategoryPatchInput(parsed.data);
    const result = await runV1Mutation({
      actorId: mutationContext.userId,
      key: mutationContext.key,
      scope: `native-calendar-category:update:${categoryId}`,
      requestHash: hashIdempotencyRequest({ categoryId, input }),
      execute: async (tx) => {
        try {
          const category = await updateCalendarCategoryForUser(tx, {
            categoryId,
            userId: mutationContext.userId,
            input,
          });
          return { status: 200, body: category as Prisma.InputJsonObject };
        } catch (cause) {
          if (cause instanceof CalendarCategoryNotFoundError) return null;
          throw cause;
        }
      },
    });
    return calendarCategoryMutationResponse(request, result);
  } catch (cause) {
    const domainError = calendarCategoryDomainError(request, cause);
    if (domainError) return domainError;
    console.error("PATCH /api/v1/calendar/categories/[categoryId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The calendar could not be updated.",
      status: 500,
      retryable: true,
    });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ categoryId: string }> },
) {
  const { categoryId } = await params;
  const mutationContext = await context(request, categoryId);
  if (!mutationContext.ok) return mutationContext.response;

  try {
    const result = await runV1Mutation({
      actorId: mutationContext.userId,
      key: mutationContext.key,
      scope: `native-calendar-category:delete:${categoryId}`,
      requestHash: hashIdempotencyRequest({ categoryId, action: "delete" }),
      execute: async (tx) => {
        try {
          const deleted = await deleteCalendarCategoryForUser(tx, {
            categoryId,
            userId: mutationContext.userId,
          });
          return { status: 200, body: deleted as Prisma.InputJsonObject };
        } catch (cause) {
          if (cause instanceof CalendarCategoryNotFoundError) return null;
          throw cause;
        }
      },
    });
    return calendarCategoryMutationResponse(request, result);
  } catch (cause) {
    const domainError = calendarCategoryDomainError(request, cause);
    if (domainError) return domainError;
    console.error("DELETE /api/v1/calendar/categories/[categoryId]", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The calendar could not be deleted.",
      status: 500,
      retryable: true,
    });
  }
}
