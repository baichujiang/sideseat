import "server-only";

import { prisma } from "@/lib/db/prisma";

export {
  BusinessFunnelEventConflictError,
  businessFunnelEventKeys,
  deterministicBusinessEventClientId,
  experimentAttributionForEligibleAssignment,
  recordServerFunnelEvent,
  type RecordedBusinessFunnelEvent,
} from "@/lib/v2/funnel-event-producer";

export async function deleteExpiredProductFunnelEvents(now = new Date()) {
  const cutoff = new Date(now.getTime() - 180 * 24 * 60 * 60 * 1000);
  const result = await prisma.productFunnelEvent.deleteMany({
    where: { receivedAt: { lt: cutoff } },
  });
  return { deleted: result.count, cutoff: cutoff.toISOString() };
}
