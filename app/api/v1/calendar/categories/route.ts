import { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  calendarCategoryDomainError,
  calendarCategoryMutationResponse,
  limitCalendarCategoryWrite,
  requireCalendarCategoryIdempotencyKey,
} from "@/lib/api/v1/calendar-category-route";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";
import {
  createCalendarCategoryForUser,
  listCalendarCategoriesForUser,
  normalizeCalendarCategoryCreateInput,
} from "@/lib/calendar/calendar-category-service";
import { ensureUserCalendarCategories } from "@/lib/calendar/default-user-calendar-categories";
import { prisma } from "@/lib/db/prisma";
import { calendarCategoryCreateSchema } from "@/lib/validators/calendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  try {
    const categories = await listCalendarCategoriesForUser(prisma, auth.user.id);
    return v1Success({ categories }, { request });
  } catch (cause) {
    console.error("GET /api/v1/calendar/categories", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The calendars could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const idempotency = requireCalendarCategoryIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;
  const parsed = await parseV1Json(request, calendarCategoryCreateSchema);
  if (!parsed.ok) return parsed.response;

  try {
    const input = normalizeCalendarCategoryCreateInput(parsed.data);
    const limited = await limitCalendarCategoryWrite(request, auth.user.id);
    if (limited) return limited;
    await ensureUserCalendarCategories(prisma, auth.user.id);
    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: "native-calendar-category:create",
      requestHash: hashIdempotencyRequest(input),
      execute: async (tx) => ({
        status: 201,
        body: (await createCalendarCategoryForUser(tx, {
          userId: auth.user.id,
          input,
        })) as Prisma.InputJsonObject,
      }),
    });
    return calendarCategoryMutationResponse(request, result);
  } catch (cause) {
    const domainError = calendarCategoryDomainError(request, cause);
    if (domainError) return domainError;
    console.error("POST /api/v1/calendar/categories", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The calendar could not be created.",
      status: 500,
      retryable: true,
    });
  }
}
