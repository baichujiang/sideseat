import { NextResponse } from "next/server";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import {
  activateCreatorGatedActionCoordination,
  type ActionCoordinationActivationMutationResult,
} from "@/lib/v2/action-coordination/activation-service";
import { evaluateActionCoordinationCapability } from "@/lib/v2/action-coordination/capability";
import { isActionCoordinationIdempotencyKey } from "@/lib/v2/action-coordination/command";
import { isActionCoordinationFailure } from "@/lib/v2/action-coordination/errors";
import { actionCoordinationFailureResult } from "@/lib/v2/action-coordination/route-adapter";

import { actionPlanInputSchema } from "../../../_plan-route";

export const dynamic = "force-dynamic";

const reservationIdSchema = z.string().uuid();
const firstMessageSchema = z
  .object({
    type: z.literal("MESSAGE"),
    body: z.string().trim().min(1).max(500),
  })
  .strict();
const firstPlanSchema = actionPlanInputSchema.extend({
  type: z.literal("PLAN"),
});
const activationRequestSchema = z
  .object({
    firstContent: z.discriminatedUnion("type", [
      firstMessageSchema,
      firstPlanSchema,
    ]),
  })
  .strict();

function mutationResponse(result: ActionCoordinationActivationMutationResult) {
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

export async function POST(
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
  const parsed = await parseV1Json(request, activationRequestSchema);
  if (!parsed.ok) return parsed.response;

  try {
    return mutationResponse(
      await activateCreatorGatedActionCoordination({
        actorId: auth.user.id,
        reservationId,
        idempotencyKey,
        capability: evaluateActionCoordinationCapability(request.headers),
        firstContent: parsed.data.firstContent,
      }),
    );
  } catch (cause) {
    if (isActionCoordinationFailure(cause)) {
      const mapped = actionCoordinationFailureResult(cause);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    console.error(
      "POST /api/v1/action-coordination/v2/reservations/[reservationId]/activate",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The coordination could not be started.",
      status: 500,
      retryable: true,
    });
  }
}
