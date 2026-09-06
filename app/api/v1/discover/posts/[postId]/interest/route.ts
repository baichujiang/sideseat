import { Prisma } from "@prisma/client";
import { z } from "zod";

import { requireV1User } from "@/lib/api/v1/auth";
import {
  discoverMutationResponse,
  limitDiscoverWrite,
  requireDiscoverIdempotencyKey,
} from "@/lib/api/v1/discover-route";
import { v1Error } from "@/lib/api/v1/http";
import { hashIdempotencyRequest } from "@/lib/api/v1/idempotency";
import { runV1Mutation } from "@/lib/api/v1/mutation";
import {
  ActionInterestError,
  createActionInterest,
  scheduleActionInterestNotification,
  withdrawActionInterest,
} from "@/lib/v2/action-interest";
import {
  ACTION_TO_PLAN_EXPERIMENT_KEY,
  getActionToPlanAssignment,
} from "@/lib/v2/experiments";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";

export const dynamic = "force-dynamic";

const postIdSchema = z.string().cuid();

function mapActionInterestError(request: Request, cause: ActionInterestError) {
  const notFound = cause.code === "NOT_FOUND";
  const restricted =
    cause.code === "CONTENT_RESTRICTED" ||
    cause.code === "SELF_INTEREST" ||
    cause.code === "CONVERSATION_UNAVAILABLE";
  return v1Error(request, {
    code: notFound ? "NOT_FOUND" : restricted ? "CONTENT_RESTRICTED" : "INVALID_REQUEST",
    message: cause.messageText,
    status: notFound ? 404 : restricted ? 403 : 409,
  });
}

async function requireTreatment(request: Request, user: Parameters<typeof getActionToPlanAssignment>[0]) {
  if (!isV2FeatureEnabled("v2ActionInterest")) {
    return {
      ok: false as const,
      response: v1Error(request, {
        code: "FEATURE_UNAVAILABLE",
        message: "Action interest is not available.",
        status: 404,
      }),
    };
  }
  const assignment = await getActionToPlanAssignment(user);
  if (!assignment.eligible || assignment.variant !== "TREATMENT") {
    return {
      ok: false as const,
      response: v1Error(request, {
        code: "FEATURE_UNAVAILABLE",
        message: "Action interest is not enabled for this account.",
        status: 404,
      }),
    };
  }
  return { ok: true as const, assignment };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const treatment = await requireTreatment(request, auth.user);
  if (!treatment.ok) return treatment.response;
  const { postId } = await params;
  if (!postIdSchema.safeParse(postId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The opportunity identifier is invalid.",
      status: 422,
      field: "postId",
    });
  }
  const idempotency = requireDiscoverIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;
  try {
    const limited = await limitDiscoverWrite(request, auth.user.id);
    if (limited) return limited;
    let notification: Parameters<typeof scheduleActionInterestNotification>[0] = null;
    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `action-interest-create:${postId}`,
      requestHash: hashIdempotencyRequest({ postId, active: true }),
      execute: async (tx) => {
        const created = await createActionInterest({
          user: auth.user,
          postId,
          experimentVariant: treatment.assignment.variant,
          tx,
        });
        notification = created.notification;
        return {
          status: 201,
          body: {
            interest: created.interest,
            messageId: created.messageId,
          } as Prisma.InputJsonObject,
        };
      },
    });
    scheduleActionInterestNotification(notification);
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof ActionInterestError) {
      return mapActionInterestError(request, cause);
    }
    console.error("POST /api/v1/discover/posts/[postId]/interest", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Interest could not be recorded.",
      status: 500,
      retryable: true,
    });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ postId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { postId } = await params;
  if (!postIdSchema.safeParse(postId).success) {
    return v1Error(request, {
      code: "INVALID_REQUEST",
      message: "The opportunity identifier is invalid.",
      status: 422,
      field: "postId",
    });
  }
  const idempotency = requireDiscoverIdempotencyKey(request);
  if (!idempotency.ok) return idempotency.response;
  try {
    const result = await runV1Mutation({
      actorId: auth.user.id,
      key: idempotency.key,
      scope: `action-interest-withdraw:${postId}`,
      requestHash: hashIdempotencyRequest({ postId, active: false }),
      execute: async (tx) => {
        // Withdrawal is a safe-drain operation. It remains available after
        // flags, allowlists, or current enrollment eligibility are removed and
        // never creates/rewrites an experiment assignment. Only exact legacy
        // seven-null Actions use this existing assignment as fallback.
        const existingAssignment = await tx.experimentAssignment.findUnique({
          where: {
            userId_experimentKey: {
              userId: auth.user.id,
              experimentKey: ACTION_TO_PLAN_EXPERIMENT_KEY,
            },
          },
          select: { variant: true },
        });
        return {
          status: 200,
          body: {
            interest: await withdrawActionInterest({
              userId: auth.user.id,
              postId,
              experimentVariant: existingAssignment?.variant ?? "CONTROL",
              tx,
            }),
          } as Prisma.InputJsonObject,
        };
      },
    });
    return discoverMutationResponse(request, result);
  } catch (cause) {
    if (cause instanceof ActionInterestError) {
      return mapActionInterestError(request, cause);
    }
    console.error("DELETE /api/v1/discover/posts/[postId]/interest", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Interest could not be withdrawn.",
      status: 500,
      retryable: true,
    });
  }
}
