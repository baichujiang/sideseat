import "server-only";

import { Prisma } from "@prisma/client";
import type { NextResponse } from "next/server";

import {
  claimIdempotency,
  completeIdempotency,
  hashIdempotencyRequest,
  readIdempotencyKey,
} from "@/lib/api/v1/idempotency";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { prisma } from "@/lib/db/prisma";

export async function runIdempotentV1Mutation<T extends Prisma.InputJsonValue>(options: {
  request: Request;
  actorId: string;
  scope: string;
  requestBody: unknown;
  execute: () => Promise<{ status: number; body: T }>;
}): Promise<NextResponse> {
  const key = readIdempotencyKey(options.request);
  if (!key) {
    return v1Error(options.request, {
      code: "IDEMPOTENCY_KEY_REQUIRED",
      message: "A valid Idempotency-Key header is required.",
      status: 422,
      field: "Idempotency-Key",
    });
  }

  const claim = await prisma.$transaction(async (tx) => {
    await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    return claimIdempotency(tx, {
      scope: options.scope,
      actorId: options.actorId,
      key,
      requestHash: hashIdempotencyRequest(options.requestBody),
    });
  });

  if (claim.kind === "conflict") {
    return v1Error(options.request, {
      code: "IDEMPOTENCY_CONFLICT",
      message: "Idempotency key was reused with a different body.",
      status: 409,
    });
  }
  if (claim.kind === "in_progress") {
    return v1Error(options.request, {
      code: "REQUEST_IN_PROGRESS",
      message: "The same request is still in progress.",
      status: 409,
      retryable: true,
      headers: { "Retry-After": "1" },
    });
  }
  if (claim.kind === "replay") {
    return v1Success(claim.body, {
      request: options.request,
      status: claim.status,
      headers: { "Idempotency-Replayed": "true" },
    });
  }

  try {
    const response = await options.execute();
    await completeIdempotency(prisma, claim, response);
    return v1Success(response.body, {
      request: options.request,
      status: response.status,
    });
  } catch (cause) {
    await prisma.apiIdempotencyRecord.delete({ where: { id: claim.recordId } }).catch(() => undefined);
    throw cause;
  }
}
