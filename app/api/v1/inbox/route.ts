import { prisma } from "@/lib/db/prisma";
import { requireV1User } from "@/lib/api/v1/auth";
import { inboxConversationV1 } from "@/lib/api/v1/inbox-dto";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { prepareInboxListMerged } from "@/lib/inbox/inbox-list-version";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";
import { loadActionResponseSummary } from "@/lib/v2/action-coordination/response-service";

import { listOpportunityMessageRequests } from "@/lib/v2/mutual-opportunities";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  try {
    const [{
      merged,
      unreadTotal,
      plansNeedingYourAction,
      planOutcomesNeedingYourResponse,
    }, actionResponseSummary, messageRequests] =
      await Promise.all([
        getInboxMergeBundle(auth.user.id),
        loadActionResponseSummary({ actorId: auth.user.id }),
        isV2FeatureEnabled("v2MutualOpportunity") ? listOpportunityMessageRequests(auth.user.id) : Promise.resolve([]),
      ]);
    const conversations = prepareInboxListMerged(merged).map((item) =>
      inboxConversationV1(item, auth.user.id),
    );

    const peerIds = conversations.flatMap(row => row.peer ? [row.peer.id] : []);
    const plusMembers = peerIds.length ? await prisma.userMembership.findMany({
      where: { userId: { in: peerIds }, plusExpiresAt: { gt: new Date() } }, select: { userId: true },
    }) : [];
    const plusIds = new Set(plusMembers.map(row => row.userId));

    return v1Success(
      {
        conversations: conversations.map(row => ({ ...row, peer: row.peer ? { ...row.peer, isPlus: plusIds.has(row.peer.id) } : null })),
        messageRequests,
        unreadTotal,
        plansNeedingYourAction,
        planOutcomesNeedingYourResponse,
        ...(actionResponseSummary ? { actionResponseSummary } : {}),
      },
      { request },
    );
  } catch (cause) {
    console.error("GET /api/v1/inbox", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to load the inbox.",
      status: 500,
      retryable: true,
    });
  }
}
