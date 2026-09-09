import "server-only";

import { notifyUserPush } from "@/lib/push/notify-user";
import { isV2FeatureEnabled } from "@/lib/v2/feature-flags";
import {
  generateMutualOpportunitiesForUser,
  type CreatedMutualOpportunityMatch,
} from "@/lib/v2/mutual-opportunities";

async function notifyNewOpportunity(
  match: CreatedMutualOpportunityMatch,
  userId: string,
): Promise<void> {
  await notifyUserPush(userId, {
    title: "A new Together opportunity",
    body: "Open SideSeat to see if it feels right.",
    url: "/discover",
    threadId: `mutual-opportunity:${match.opportunityId}`,
    category: "MUTUAL_OPPORTUNITY",
    data: {
      kind: "mutual_opportunity",
      opportunityId: match.opportunityId,
    },
  });
}

/**
 * Publishing/resuming an intention triggers matching immediately. The matcher
 * verifies active, unexpired per-intent consent (or a legacy matching session).
 *
 * `createMany(skipDuplicates)` inside the matcher is the notification gate:
 * only the request that actually inserts a new opportunity gets it back here.
 * Refreshes and concurrent repeated calls therefore do not resend a push for
 * an existing opportunity.
 */
export async function matchAndNotifyForUser(userId: string): Promise<void> {
  if (!isV2FeatureEnabled("v2WeeklyIntent") || !isV2FeatureEnabled("v2MutualOpportunity")) return;
  const created = await generateMutualOpportunitiesForUser(userId);
  if (created.length === 0) return;

  const deliveries = new Map<
    string,
    { match: CreatedMutualOpportunityMatch; userId: string }
  >();
  for (const match of created) {
    for (const participantId of [match.userAId, match.userBId]) {
      deliveries.set(`${match.opportunityId}:${participantId}`, {
        match,
        userId: participantId,
      });
    }
  }

  await Promise.all(
    [...deliveries.values()].map(async ({ match, userId: recipientId }) => {
      await notifyNewOpportunity(match, recipientId).catch((cause) => {
        // The opportunity is already usable in Together. A transient push
        // failure must never roll back or hide the matched action.
        console.error("Mutual opportunity push failed", {
          opportunityId: match.opportunityId,
          recipientId,
          cause,
        });
      });
    }),
  );
}
