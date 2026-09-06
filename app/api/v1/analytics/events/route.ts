import { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import { parseV1Json, v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";
import { productFunnelBatchSchema } from "@/lib/validators/product-funnel";
import {
  ACTION_TO_PLAN_EXPERIMENT_KEY,
  getActionToPlanAssignment,
} from "@/lib/v2/experiments";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const parsed = await parseV1Json(request, productFunnelBatchSchema);
  if (!parsed.ok) return parsed.response;

  const now = Date.now();
  const tooOld = now - 7 * 24 * 60 * 60 * 1_000;
  const tooNew = now + 5 * 60 * 1_000;
  const invalidTime = parsed.data.events.find((event) => {
    const value = new Date(event.occurredAt).getTime();
    return value < tooOld || value > tooNew;
  });
  if (invalidTime) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "An analytics event has an invalid occurrence time.",
      status: 422,
      field: "events.occurredAt",
    });
  }

  try {
    const assignment = await getActionToPlanAssignment(auth.user);
    const result = await prisma.productFunnelEvent.createMany({
      data: parsed.data.events.map((event) => ({
        clientEventId: event.clientEventId,
        actorId: auth.user.id,
        name: event.name,
        surface: event.surface,
        sourceKind: event.sourceKind ?? null,
        sourceId: event.sourceId ?? null,
        experimentKey: assignment.eligible ? ACTION_TO_PLAN_EXPERIMENT_KEY : null,
        experimentVariant: assignment.eligible ? assignment.variant : null,
        metadata: event.metadata as Prisma.InputJsonObject | undefined,
        occurredAt: new Date(event.occurredAt),
      })),
      skipDuplicates: true,
    });
    return v1Success(
      { accepted: result.count, deduplicated: parsed.data.events.length - result.count },
      { request, status: 202 },
    );
  } catch (cause) {
    console.error("POST /api/v1/analytics/events", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Analytics events could not be recorded.",
      status: 500,
      retryable: true,
    });
  }
}
