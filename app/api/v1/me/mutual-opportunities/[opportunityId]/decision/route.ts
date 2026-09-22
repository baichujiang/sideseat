import type { Prisma } from "@prisma/client";

import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { scheduleNewDirectChatMessageNotification } from "@/lib/push/notify-user";
import { mutualOpportunityDecisionSchema } from "@/lib/validators/mutual-opportunity";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import { matchAndNotifyForUser } from "@/lib/v2/mutual-opportunity-auto-match";
import {
  decideMutualOpportunity,
  MutualOpportunityError,
  withdrawMutualOpportunityDecision,
} from "@/lib/v2/mutual-opportunities";

export const dynamic = "force-dynamic";

function unavailable(request: Request) {
  return v1Error(request, {
    code: "FEATURE_UNAVAILABLE",
    message: "Together opportunities are not available.",
    status: 404,
  });
}

function domainError(request: Request, cause: MutualOpportunityError) {
  switch (cause.code) {
    case "NOT_FOUND":
      return v1Error(request, {
        code: "NOT_FOUND",
        message: "This opportunity is no longer available.",
        status: 404,
      });
    case "DECISION_FINAL":
      return v1Error(request, {
        code: "STATE_CONFLICT",
        message: "Your decision has already been finalized.",
        status: 409,
      });
    default:
      return v1Error(request, {
        code: "STATE_CONFLICT",
        message: "This opportunity is no longer available.",
        status: 409,
      });
  }
}

async function opportunityId(
  request: Request,
  params: Promise<{ opportunityId: string }>,
) {
  const value = (await params).opportunityId;
  const checked = requireV1Cuid(request, value, "opportunityId");
  return checked.ok ? { ok: true as const, value } : checked;
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (
    !isV2FeatureEnabled("v2WeeklyIntent") ||
    !isV2FeatureEnabled("v2MutualOpportunity")
  ) return unavailable(request);
  const id = await opportunityId(request, params);
  if (!id.ok) return id.response;
  const parsed = await parseV1Json(request, mutualOpportunityDecisionSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `mutual-opportunity-decision:${id.value}`,
      requestBody: parsed.data,
      execute: async () => {
        const result = await decideMutualOpportunity({
          userId: auth.user.id,
          opportunityId: id.value,
          decision: parsed.data.decision,
        });
        const body = result.opportunity;
        if (request.headers.get("X-SideSeat-Flexible-Timing") !== "1" && body.matchFit?.policyVersion === "ACTIVITY_FIT_V2") {
          body.matchFit = null;
        }
        if (result.rematchUserIds.length > 0) {
          await Promise.all(
            result.rematchUserIds.map(async (userId) => {
              await matchAndNotifyForUser(userId).catch((cause) => {
                console.error("Mutual opportunity rematch failed", {
                  opportunityId: id.value,
                  userId,
                  cause,
                });
              });
            }),
          );
        }
        if (body.state === "READY_TO_COORDINATE" && body.coordination) {
          scheduleNewDirectChatMessageNotification({
            connectionId: body.coordination.connectionId,
            senderId: auth.user.id,
            bodyPreview: "You can plan this together now.",
          });
        }
        return {
          status: 200,
          body: body as unknown as Prisma.InputJsonValue,
        };
      },
    });
  } catch (cause) {
    if (cause instanceof MutualOpportunityError) return domainError(request, cause);
    console.error("POST /api/v1/me/mutual-opportunities/[opportunityId]/decision", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Your decision could not be saved.",
      status: 500,
      retryable: true,
    });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ opportunityId: string }> },
) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const id = await opportunityId(request, params);
  if (!id.ok) return id.response;
  try {
    return await runIdempotentV1Mutation({
      request,
      actorId: auth.user.id,
      scope: `mutual-opportunity-withdraw:${id.value}`,
      requestBody: { opportunityId: id.value },
      execute: async () => {
        const result = await withdrawMutualOpportunityDecision({
          userId: auth.user.id,
          opportunityId: id.value,
        });
        if (request.headers.get("X-SideSeat-Flexible-Timing") !== "1" && result.opportunity.matchFit?.policyVersion === "ACTIVITY_FIT_V2") {
          result.opportunity.matchFit = null;
        }
        await Promise.all(
          result.rematchUserIds.map(async (userId) => {
            await matchAndNotifyForUser(userId).catch((cause) => {
              console.error("Mutual opportunity rematch after withdrawal failed", {
                opportunityId: id.value,
                userId,
                cause,
              });
            });
          }),
        );
        return {
          status: 200,
          body: result.opportunity as unknown as Prisma.InputJsonValue,
        };
      },
    });
  } catch (cause) {
    if (cause instanceof MutualOpportunityError) return domainError(request, cause);
    console.error("DELETE /api/v1/me/mutual-opportunities/[opportunityId]/decision", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Your decision could not be withdrawn.",
      status: 500,
      retryable: true,
    });
  }
}
