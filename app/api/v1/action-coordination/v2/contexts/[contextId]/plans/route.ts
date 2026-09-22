import { NextResponse } from "next/server";

import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { isActionCoordinationIdempotencyKey } from "@/lib/v2/action-coordination/command";
import { isActionCoordinationFailure } from "@/lib/v2/action-coordination/errors";
import { createActionPlan } from "@/lib/v2/action-coordination/plan-service";
import { actionCoordinationFailureResult } from "@/lib/v2/action-coordination/route-adapter";

import {
  actionPlanIdentifierSchema,
  actionPlanInputSchema,
  actionPlanMutationResponse,
} from "../../../_plan-route";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ contextId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { contextId } = await params;
  if (!actionPlanIdentifierSchema.safeParse(contextId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The coordination identifier is invalid.",
      status: 422,
      field: "contextId",
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
  const parsed = await parseV1Json(request, actionPlanInputSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return actionPlanMutationResponse(
      await createActionPlan({
        actorId: auth.user.id,
        contextId,
        idempotencyKey,
        input: parsed.data,
      }),
    );
  } catch (cause) {
    if (isActionCoordinationFailure(cause)) {
      const mapped = actionCoordinationFailureResult(cause);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    console.error(
      "POST /api/v1/action-coordination/v2/contexts/[contextId]/plans",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The Plan could not be proposed.",
      status: 500,
      retryable: true,
    });
  }
}
