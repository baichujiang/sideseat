import { DiscoverActivityStatus } from "@prisma/client";

import type { DiscoverActivityRow } from "@/lib/discover/discover-activity-row";
import { isVisibleInFeed } from "@/lib/discover/discover-activity-state";
import {
  discoverActivityForFeedInclude,
  prismaDiscoverActivityToRow,
} from "@/lib/discover/prisma-discover-activity-for-discover";
import { prisma } from "@/lib/db/prisma";

/** Active Discover activities for a city — browse without signing in. */
export async function loadActiveDiscoverActivitiesForCity(
  servedCity: string,
  viewerUserId?: string | null,
): Promise<DiscoverActivityRow[]> {
  const now = new Date();

  const rows = await prisma.discoverActivity.findMany({
    where: {
      city: servedCity,
      status: { in: [DiscoverActivityStatus.OPEN, DiscoverActivityStatus.FULL] },
      startAt: { gt: now },
      organizer: {
        moderationBlocks: { none: { isActive: true } },
        ...(viewerUserId
          ? {
              blocksReceived: { none: { blockerId: viewerUserId } },
              blocksInitiated: { none: { blockedId: viewerUserId } },
            }
          : {}),
      },
    },
    include: discoverActivityForFeedInclude,
    orderBy: { startAt: "asc" },
    take: 120,
  });

  return rows
    .filter((activity) => isVisibleInFeed(activity, now))
    .map((activity) => prismaDiscoverActivityToRow(activity, viewerUserId ?? null, now));
}
