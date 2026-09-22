import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import {
  CalendarSubscriptionLimitError,
  createCalendarSubscription,
  listCalendarSubscriptions,
} from "@/lib/calendar/calendar-subscription-service";
import { prisma } from "@/lib/db/prisma";
import { requestAppOrigin } from "@/lib/http/request-app-origin";

export const dynamic = "force-dynamic";

const createSchema = z
  .object({ label: z.string().trim().min(1).max(80).default("Apple Calendar") })
  .strict();

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  try {
    return v1Success(await listCalendarSubscriptions(prisma, auth.user.id), { request });
  } catch (cause) {
    console.error("GET /api/v1/calendar/subscriptions", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Calendar connections could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const parsed = await parseV1Json(request, createSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: "native-calendar-subscription-create",
      requestBody: parsed.data,
      execute: async () => ({
        status: 201,
        body: await createCalendarSubscription(prisma, {
          ownerUserId: auth.user.id,
          label: parsed.data.label ?? "Apple Calendar",
          requestOrigin: requestAppOrigin(request),
        }),
      }),
    });
  } catch (cause) {
    if (cause instanceof CalendarSubscriptionLimitError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: cause.message,
        status: 409,
      });
    }
    console.error("POST /api/v1/calendar/subscriptions", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The Apple Calendar connection could not be created.",
      status: 500,
      retryable: true,
    });
  }
}
