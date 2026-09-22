import { NextResponse } from "next/server";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import {
  evaluateActionCoordinationCapability,
} from "@/lib/v2/action-coordination/capability";
import {
  isActionCoordinationIdempotencyKey,
} from "@/lib/v2/action-coordination/command";
import {
  isActionCoordinationConflict,
  isActionCoordinationFailure,
} from "@/lib/v2/action-coordination/errors";
import {
  reactivateCreatorGatedInterest,
  type CreatorGatedInterestMutationResult,
} from "@/lib/v2/action-coordination/interest-service";
import {
  actionCoordinationConflictResult,
  actionCoordinationFailureResult,
  actionCoordinationRetryAfterSeconds,
} from "@/lib/v2/action-coordination/route-adapter";

export const dynamic = "force-dynamic";

const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
const requestSchema = z
  .object({
    interestSurface: z.enum(["FEED_CARD", "ACTION_DETAIL"]),
  })
  .strict();

function mutationResponse(result: CreatorGatedInterestMutationResult) {
  const headers = new Headers({
    "Cache-Control": "private, no-store, max-age=0",
  });
  if (result.kind === "replayed") {
    headers.set("Idempotency-Replayed", "true");
  }
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
  const retryAfterSeconds = actionCoordinationRetryAfterSeconds(result.body);
  if (result.status === 429 && retryAfterSeconds !== null) {
    headers.set("Retry-After", String(retryAfterSeconds));
  }
  return NextResponse.json(result.body, { status: result.status, headers });
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ interestId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { interestId } = await params;
  if (!identifierSchema.safeParse(interestId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The response identifier is invalid.",
      status: 422,
      field: "interestId",
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
      await reactivateCreatorGatedInterest({
        actorId: auth.user.id,
        interestId,
        interestSurface: parsed.data.interestSurface,
        idempotencyKey,
        capability: evaluateActionCoordinationCapability(request.headers),
      }),
    );
  } catch (cause) {
    if (isActionCoordinationConflict(cause)) {
      const mapped = actionCoordinationConflictResult(cause);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    if (isActionCoordinationFailure(cause)) {
      const mapped = actionCoordinationFailureResult(cause);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    console.error(
      "POST /api/v1/action-coordination/v2/interests/[interestId]/reactivate",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The response could not be reactivated.",
      status: 500,
      retryable: true,
    });
  }
}
