import { NextResponse } from "next/server";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error } from "@/lib/api/v1/http";
import {
  isActionCoordinationIdempotencyKey,
} from "@/lib/v2/action-coordination/command";
import {
  isActionCoordinationConflict,
  isActionCoordinationFailure,
} from "@/lib/v2/action-coordination/errors";
import {
  getCreatorGatedInterest,
  withdrawCreatorGatedInterest,
  type CreatorGatedInterestMutationResult,
} from "@/lib/v2/action-coordination/interest-service";
import {
  actionCoordinationConflictResult,
  actionCoordinationFailureResult,
} from "@/lib/v2/action-coordination/route-adapter";

export const dynamic = "force-dynamic";

const identifierSchema = z
  .string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);

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
  return NextResponse.json(result.body, { status: result.status, headers });
}

export async function GET(
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
  try {
    const interest = await getCreatorGatedInterest({
      actorId: auth.user.id,
      interestId,
    });
    if (!interest) {
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "The response was not found.",
        status: 404,
      });
    }
    return NextResponse.json(
      { interest },
      {
        status: 200,
        headers: { "Cache-Control": "private, no-store, max-age=0" },
      },
    );
  } catch (cause) {
    console.error(
      "GET /api/v1/action-coordination/v2/interests/[interestId]",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The response could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function DELETE(
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
      await withdrawCreatorGatedInterest({
        actorId: auth.user.id,
        interestId,
        idempotencyKey,
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
      "DELETE /api/v1/action-coordination/v2/interests/[interestId]",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The response could not be withdrawn.",
      status: 500,
      retryable: true,
    });
  }
}
