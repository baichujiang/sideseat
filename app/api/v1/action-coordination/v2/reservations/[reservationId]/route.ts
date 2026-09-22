import { NextResponse } from "next/server";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error } from "@/lib/api/v1/http";
import { isActionCoordinationIdempotencyKey } from "@/lib/v2/action-coordination/command";
import { isActionCoordinationFailure } from "@/lib/v2/action-coordination/errors";
import {
  releaseCreatorGatedActionCoordinationReservation,
  type ActionCoordinationReservationReleaseMutationResult,
} from "@/lib/v2/action-coordination/reservation-service";
import { actionCoordinationFailureResult } from "@/lib/v2/action-coordination/route-adapter";

export const dynamic = "force-dynamic";

const reservationIdSchema = z.string().uuid();

function mutationResponse(
  result: ActionCoordinationReservationReleaseMutationResult,
) {
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
  return NextResponse.json(result.body, { status: result.status, headers });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ reservationId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { reservationId } = await params;
  if (!reservationIdSchema.safeParse(reservationId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The reservation identifier is invalid.",
      status: 422,
      field: "reservationId",
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
      await releaseCreatorGatedActionCoordinationReservation({
        actorId: auth.user.id,
        reservationId,
        idempotencyKey,
      }),
    );
  } catch (cause) {
    if (isActionCoordinationFailure(cause)) {
      const mapped = actionCoordinationFailureResult(cause);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    console.error(
      "DELETE /api/v1/action-coordination/v2/reservations/[reservationId]",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The coordination shell could not be released.",
      status: 500,
      retryable: true,
    });
  }
}
