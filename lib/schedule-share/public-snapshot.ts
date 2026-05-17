import type { Prisma, PrismaClient } from "@prisma/client";

import type { ScheduleShareLinkWithOwner } from "@/lib/schedule-share/resolve-link";
import { parseRevealConfigJson } from "@/lib/schedule-share/reveal-config";
import {
  collectInternalScheduleBlocks,
  internalBlocksToPublicSnapshot,
  scheduleShareOwnerDisplayLabel,
  type PublicScheduleShareSnapshot,
} from "@/lib/schedule-share/build-schedule-share-snapshot";

type Db = PrismaClient | Prisma.TransactionClient;

export async function buildPublicScheduleShareSnapshotForActiveLink(
  db: Db,
  link: ScheduleShareLinkWithOwner,
): Promise<PublicScheduleShareSnapshot> {
  const reveal = parseRevealConfigJson(link.revealConfig);
  const internal = await collectInternalScheduleBlocks(db, link.ownerUserId, link.rangeStart, link.rangeEnd);
  const ownerDisplayLabel = scheduleShareOwnerDisplayLabel(link.owner) ?? "";
  return internalBlocksToPublicSnapshot({
    internal,
    rangeStart: link.rangeStart,
    rangeEnd: link.rangeEnd,
    reveal,
    ownerDisplayLabel,
    linkExpiresAt: link.expiresAt,
    allowGuestProposals: link.allowGuestProposals,
  });
}
