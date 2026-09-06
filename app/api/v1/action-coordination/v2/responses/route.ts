import { NextResponse } from "next/server";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error } from "@/lib/api/v1/http";
import { isActionCoordinationFailure } from "@/lib/v2/action-coordination/errors";
import {
  ActionResponsesCursorError,
  ActionResponsesCursorExpiredError,
  listCreatorActionResponses,
} from "@/lib/v2/action-coordination/response-service";
import { actionCoordinationFailureResult } from "@/lib/v2/action-coordination/route-adapter";

export const dynamic = "force-dynamic";

const querySchema = z
  .object({
    actionId: z.string().min(1).max(128).optional(),
    presentation: z.enum(["VISIBLE", "HIDDEN"]).default("VISIBLE"),
    limit: z.coerce.number().int().min(1).max(50).default(30),
    cursor: z.string().min(1).max(2_048).optional(),
  })
  .strict();

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    actionId: url.searchParams.get("actionId") ?? undefined,
    presentation: url.searchParams.get("presentation") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
  });
  if (!parsed.success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: parsed.error.issues[0]?.message ?? "Invalid response filter.",
      status: 422,
      field: parsed.error.issues[0]?.path.join("."),
    });
  }
  try {
    return NextResponse.json(
      await listCreatorActionResponses({
        actorId: auth.user.id,
        actionId: parsed.data.actionId,
        presentation: parsed.data.presentation,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      }),
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  } catch (cause) {
    if (cause instanceof ActionResponsesCursorExpiredError) {
      return v1Error(request, {
        code: cause.code,
        message: cause.message,
        status: 410,
        field: "cursor",
      });
    }
    if (cause instanceof ActionResponsesCursorError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: cause.message,
        status: 422,
        field: "cursor",
      });
    }
    if (isActionCoordinationFailure(cause)) {
      const mapped = actionCoordinationFailureResult(cause);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    console.error("GET /api/v1/action-coordination/v2/responses", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Action responses could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
