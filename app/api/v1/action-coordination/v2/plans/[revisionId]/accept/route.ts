import { NextResponse } from "next/server";

import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error } from "@/lib/api/v1/http";
import { isActionCoordinationIdempotencyKey } from "@/lib/v2/action-coordination/command";
import { isActionCoordinationFailure } from "@/lib/v2/action-coordination/errors";
import { acceptActionPlan } from "@/lib/v2/action-coordination/plan-service";
import { actionCoordinationFailureResult } from "@/lib/v2/action-coordination/route-adapter";

import {
  actionPlanIdentifierSchema,
  actionPlanMutationResponse,
} from "../../../_plan-route";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ revisionId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { revisionId } = await params;
  if (!actionPlanIdentifierSchema.safeParse(revisionId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The Plan revision identifier is invalid.",
      status: 422,
      field: "revisionId",
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
    return actionPlanMutationResponse(
      await acceptActionPlan({
        actorId: auth.user.id,
        revisionId,
        idempotencyKey,
      }),
    );
  } catch (cause) {
    if (isActionCoordinationFailure(cause)) {
      const mapped = actionCoordinationFailureResult(cause);
      return NextResponse.json(mapped.body, { status: mapped.status });
    }
    console.error(
      "POST /api/v1/action-coordination/v2/plans/[revisionId]/accept",
      cause,
    );
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The Plan could not be accepted.",
      status: 500,
      retryable: true,
    });
  }
}
