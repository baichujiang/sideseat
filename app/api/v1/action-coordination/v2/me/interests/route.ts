import { NextResponse } from "next/server";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error } from "@/lib/api/v1/http";
import {
  CreatorGatedInterestCursorError,
  listMyCreatorGatedInterests,
} from "@/lib/v2/action-coordination/interest-service";

export const dynamic = "force-dynamic";

const querySchema = z.object({
  state: z.enum(["ALL", "WAITING", "TERMINAL"]).default("ALL"),
  limit: z.coerce.number().int().min(1).max(50).default(50),
  cursor: z.string().min(1).max(1024).optional(),
});

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    state: url.searchParams.get("state") ?? undefined,
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
      await listMyCreatorGatedInterests({
        actorId: auth.user.id,
        state: parsed.data.state,
        limit: parsed.data.limit,
        cursor: parsed.data.cursor,
      }),
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  } catch (cause) {
    if (cause instanceof CreatorGatedInterestCursorError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: cause.message,
        status: 422,
        field: "cursor",
      });
    }
    console.error(
      "GET /api/v1/action-coordination/v2/me/interests",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Responses could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
