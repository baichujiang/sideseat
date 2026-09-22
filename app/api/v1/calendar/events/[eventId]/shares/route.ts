import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseCalendarOccurrenceId } from "@/lib/calendar/calendar-occurrence-id";
import { prisma } from "@/lib/db/prisma";
import {
  createEventShareLink,
  EventShareSourceNotFoundError,
} from "@/lib/event-share/event-share-service";
import { requestAppOrigin } from "@/lib/http/request-app-origin";

export const dynamic = "force-dynamic";

const eventIdSchema = z.string().refine(
  (value) => z.string().cuid().safeParse(value).success || Boolean(parseCalendarOccurrenceId(value)),
  "Invalid calendar event identifier.",
);

const createEventShareSchema = z
  .object({
    includeLocation: z.boolean().default(true),
    includeNotes: z.boolean().default(false),
  })
  .strict();

export async function POST(
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
  const parsed = await parseV1Json(request, createEventShareSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `native-calendar-event-share:${eventId}`,
      requestBody: parsed.data,
      execute: async () => ({
        status: 201,
        body: await createEventShareLink(prisma, {
          owner: auth.user,
          eventId,
          input: {
            includeLocation: parsed.data.includeLocation ?? true,
            includeNotes: parsed.data.includeNotes ?? false,
          },
          requestOrigin: requestAppOrigin(request),
        }),
      }),
    });
  } catch (cause) {
    if (cause instanceof EventShareSourceNotFoundError) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: cause.message,
        status: 404,
      });
    }
    console.error("POST /api/v1/calendar/events/[eventId]/shares", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The event share link could not be created.",
      status: 500,
      retryable: true,
    });
  }
}
