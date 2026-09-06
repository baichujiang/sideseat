import { NextResponse } from "next/server";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error } from "@/lib/api/v1/http";
import { evaluateActionCoordinationCapability } from "@/lib/v2/action-coordination/capability";
import { isActionCoordinationIdempotencyKey } from "@/lib/v2/action-coordination/command";
import { isActionCoordinationFailure } from "@/lib/v2/action-coordination/errors";
import {
  reserveCreatorGatedActionCoordination,
  type ActionCoordinationReservationMutationResult,
} from "@/lib/v2/action-coordination/reservation-service";
import {
  actionCoordinationFailureResult,
  actionCoordinationRetryAfterSeconds,
} from "@/lib/v2/action-coordination/route-adapter";

export const dynamic = "force-dynamic";

const identifierSchema = z.string().min(1).max(128);

function mutationResponse(result: ActionCoordinationReservationMutationResult) {
  const headers = new Headers({ "Cache-Control": "private, no-store, max-age=0" });
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
  const retryAfterSeconds = actionCoordinationRetryAfterSeconds(result.body);
  if (retryAfterSeconds !== null) headers.set("Retry-After", String(retryAfterSeconds));
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
      await reserveCreatorGatedActionCoordination({
        actorId: auth.user.id,
        interestId,
        idempotencyKey,
        capability: evaluateActionCoordinationCapability(request.headers),
      }),
    );
  } catch (cause) {
    if (isActionCoordinationFailure(cause)) {
      const mapped = actionCoordinationFailureResult(cause);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    console.error(
      "POST /api/v1/action-coordination/v2/interests/[interestId]/reservations",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The coordination shell could not be reserved.",
      status: 500,
      retryable: true,
    });
  }
}
