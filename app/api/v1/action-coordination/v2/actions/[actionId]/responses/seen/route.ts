import { NextResponse } from "next/server";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { isActionCoordinationIdempotencyKey } from "@/lib/v2/action-coordination/command";
import { isActionCoordinationFailure } from "@/lib/v2/action-coordination/errors";
import {
  ActionResponsesCursorError,
  ActionResponsesCursorExpiredError,
  markCreatorActionResponsesSeen,
  type ActionResponsesSeenMutationResult,
} from "@/lib/v2/action-coordination/response-service";
import { actionCoordinationFailureResult } from "@/lib/v2/action-coordination/route-adapter";

export const dynamic = "force-dynamic";

const identifierSchema = z.string().min(1).max(128);
const requestSchema = z
  .object({
    snapshotToken: z.string().min(1).max(2_048),
    interestIds: z.array(identifierSchema).min(1).max(50),
  })
  .strict()
  .superRefine((value, context) => {
    if (new Set(value.interestIds).size !== value.interestIds.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["interestIds"],
        message: "Response identifiers must be unique.",
      });
    }
  });

function mutationResponse(result: ActionResponsesSeenMutationResult) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
  });
  if (result.kind === "replayed") headers.set("Idempotency-Replayed", "true");
  if (result.kind === "idempotency_conflict") {
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: "This Idempotency-Key was already used for another request.",
          retryable: false,
        },
      },
      { status: result.status, headers },
    );
  }
  if (result.kind === "in_progress") {
    headers.set("Retry-After", String(result.retryAfterSeconds));
    return NextResponse.json(
      {
        error: {
          code: result.code,
          message: "The matching request is still being processed.",
          retryable: true,
        },
      },
      { status: result.status, headers },
    );
  }
  return NextResponse.json(result.body, { status: result.status, headers });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ actionId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { actionId } = await params;
  if (!identifierSchema.safeParse(actionId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The Action identifier is invalid.",
      status: 422,
      field: "actionId",
    });
  }
  const parsed = await parseV1Json(request, requestSchema);
  if (!parsed.ok) return parsed.response;
  const idempotencyKey = request.headers.get("idempotency-key")?.trim();
  if (!isActionCoordinationIdempotencyKey(idempotencyKey)) {
    return v1Error(request, {
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "A valid Idempotency-Key header is required.",
      status: 422,
      field: "Idempotency-Key",
    });
  }
  try {
    return mutationResponse(
      await markCreatorActionResponsesSeen({
        actorId: auth.user.id,
        actionId,
        snapshotToken: parsed.data.snapshotToken,
        interestIds: parsed.data.interestIds,
        idempotencyKey,
      }),
    );
  } catch (cause) {
    if (cause instanceof ActionResponsesCursorExpiredError) {
      return v1Error(request, {
        code: cause.code,
        message: cause.message,
        status: 410,
        field: "snapshotToken",
      });
    }
    if (cause instanceof ActionResponsesCursorError) {
      return v1Error(request, {
        code: "INVALID_REQUEST",
        message: cause.message,
        status: 422,
        field: "snapshotToken",
      });
    }
    if (isActionCoordinationFailure(cause)) {
      const mapped = actionCoordinationFailureResult(cause);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    console.error(
      "POST /api/v1/action-coordination/v2/actions/[actionId]/responses/seen",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The rendered responses could not be marked seen.",
      status: 500,
      retryable: true,
    });
  }
}
