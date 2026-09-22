import { NextResponse } from "next/server";
import { z } from "zod";

import type { ActionPlanMutationResult } from "@/lib/v2/action-coordination/plan-service";

export const actionPlanIdentifierSchema = z.string().min(1).max(128);

export const actionPlanInputSchema = z
  .object({
    planType: z.enum(["STUDY", "MEAL", "SPORTS", "LANGUAGE", "CUSTOM"]),
    title: z.string().trim().min(1).max(120),
    location: z.string().trim().max(120).nullable().optional(),
    message: z.string().trim().max(500).nullable().optional(),
    startTime: z.string().datetime({ offset: true }),
    endTime: z.string().datetime({ offset: true }),
  })
  .strict();

export function actionPlanMutationResponse(result: ActionPlanMutationResult) {
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
