import { after } from "next/server";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { parseV1Json, v1Error } from "@/lib/api/v1/http";
import { runIdempotentV1Mutation } from "@/lib/api/v1/idempotent-mutation";
import { opportunityInteractionSchema } from "@/lib/validators/mutual-opportunity";
import { matchAndNotifyForUser } from "@/lib/v2/mutual-opportunity-auto-match";
import { interactWithOpportunity, MutualOpportunityError } from "@/lib/v2/mutual-opportunities";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import { notifyUserPush, scheduleNewDirectChatMessageNotification } from "@/lib/push/notify-user";

export const dynamic = "force-dynamic";

export async function POST(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  if (!isV2FeatureEnabled("v2WeeklyIntent") || !isV2FeatureEnabled("v2MutualOpportunity")) {
    return v1Error(request, { code: "FEATURE_UNAVAILABLE", message: "Together is not available.", status: 404 });
  }
  const { opportunityId } = await params;
  const id = requireV1Cuid(request, opportunityId, "opportunityId");
  if (!id.ok) return id.response;
  const parsed = await parseV1Json(request, opportunityInteractionSchema);
  if (!parsed.ok) return parsed.response;
  try {
    return await runIdempotentV1Mutation({
      request, actorId: auth.user.id, scope: `opportunity-interaction:${opportunityId}`,
      requestBody: parsed.data,
      execute: async () => {
        const result = await interactWithOpportunity({ userId: auth.user.id, opportunityId, ...parsed.data });
        if (parsed.data.action === "IGNORE") {
          after(async () => {
            try {
              const row = await prisma.mutualOpportunity.findUnique({ where: { id: opportunityId }, select: { userAId: true, userBId: true } });
              if (row) await Promise.all([row.userAId, row.userBId].map(userId => matchAndNotifyForUser(userId)));
            } catch (cause) { console.error("Rematch after message request ignored failed", cause); }
          });
        }
        if (parsed.data.action === "SEND") {
          after(async () => {
            try {
              const current = await prisma.mutualOpportunity.findFirst({ where: {
                id: opportunityId, status: "PENDING", expiresAt: { gt: new Date() },
                messageRequest: { is: { senderId: auth.user.id, status: "PENDING" } },
              }, select: { userAId: true, userBId: true } });
              if (!current) return;
              const recipientId = current.userAId === auth.user.id ? current.userBId : current.userAId;
              const blocked = await prisma.block.findFirst({ where: { OR: [
                { blockerId: auth.user.id, blockedId: recipientId }, { blockerId: recipientId, blockedId: auth.user.id },
              ] } });
              if (blocked) return;
              await notifyUserPush(recipientId, { title: "New message request", body: "Someone sent you a message about your intention.",
                url: "/inbox", threadId: `opportunity-request:${opportunityId}`, data: { kind: "message_request", opportunityId } });
            } catch (cause) { console.error("Opportunity request notification failed", cause); }
          });
        }
        if (parsed.data.action === "REPLY" && result.coordination) {
          scheduleNewDirectChatMessageNotification({ connectionId: result.coordination.connectionId,
            senderId: auth.user.id, bodyPreview: parsed.data.body });
        }
        return { status: 200, body: result as unknown as Prisma.InputJsonValue };
      },
    });
  } catch (cause) {
    if (cause instanceof MutualOpportunityError) {
      return v1Error(request, { code: cause.code === "NOT_FOUND" ? "NOT_FOUND" : "STATE_CONFLICT",
        message: cause.code === "DECISION_FINAL" ? "This message request has already been handled." : "This intention is no longer available.",
        status: cause.code === "NOT_FOUND" ? 404 : 409 });
    }
    console.error("POST opportunity interaction", cause);
    return v1Error(request, { code: "INTERNAL_ERROR", message: "Your action could not be saved.", status: 500, retryable: true });
  }
}
