import "server-only";

import { Prisma } from "@prisma/client";

import {
  claimIdempotency,
  completeIdempotency,
  type IdempotencyClaim,
} from "@/lib/api/v1/idempotency";
import { prisma } from "@/lib/db/prisma";

export type V1MutationResult<T> =
  | { kind: "completed"; status: number; body: T }
  | { kind: "not_found" }
  | Extract<IdempotencyClaim, { kind: "conflict" | "in_progress" | "replay" }>;

export async function runV1Mutation<T extends Prisma.InputJsonValue>(options: {
  actorId: string;
  key: string;
  scope: string;
  requestHash: string;
  execute: (
    tx: Prisma.TransactionClient,
  ) => Promise<{ status: number; body: T } | null>;
}): Promise<V1MutationResult<T>> {
  return prisma.$transaction(async (tx) => {
    await tx.apiIdempotencyRecord.deleteMany({ where: { expiresAt: { lt: new Date() } } });
    const claim = await claimIdempotency(tx, {
      scope: options.scope,
      actorId: options.actorId,
      key: options.key,
      requestHash: options.requestHash,
    });
    if (claim.kind !== "owner") return claim;

    const response = await options.execute(tx);
    if (!response) {
      await tx.apiIdempotencyRecord.delete({ where: { id: claim.recordId } });
      return { kind: "not_found" } as const;
    }
    await completeIdempotency(tx, claim, response);
    return { kind: "completed", ...response } as const;
  });
}
