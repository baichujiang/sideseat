import { ClassmatePostStatus } from "@prisma/client";

import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import { getDevExampleDiscoverPosts } from "@/lib/discover/dev-example-classmate-posts";
import {
  classmatePostForDiscoverInclude,
  prismaClassmatePostToDiscoverRow,
} from "@/lib/discover/prisma-classmate-post-for-discover";
import { prisma } from "@/lib/db/prisma";

/** Active Discover posts for a city — browse without signing in. */
export async function loadActiveDiscoverPostsForCity(
  servedCity: string,
  viewerUserId?: string | null,
): Promise<DiscoverPostRow[]> {
  const activePosts = await prisma.classmatePost.findMany({
    where: {
      status: ClassmatePostStatus.ACTIVE,
      expiresAt: { gt: new Date() },
      city: servedCity,
      user: {
        moderationBlocks: { none: { isActive: true } },
        ...(viewerUserId
          ? {
              blocksReceived: { none: { blockerId: viewerUserId } },
              blocksInitiated: { none: { blockedId: viewerUserId } },
            }
          : {}),
      },
    },
    include: classmatePostForDiscoverInclude,
    orderBy: { createdAt: "desc" },
    take: 120,
  });

  const savedPostIdSet = new Set<string>();
  if (viewerUserId) {
    const savedRows = await prisma.classmatePostSave.findMany({
      where: { userId: viewerUserId },
      select: { classmatePostId: true },
    });
    for (const row of savedRows) savedPostIdSet.add(row.classmatePostId);
  }

  const postsFromDb: DiscoverPostRow[] = activePosts.map((post) =>
    prismaClassmatePostToDiscoverRow(post, viewerUserId ?? null, {
      savedByViewer: viewerUserId ? savedPostIdSet.has(post.id) : false,
    }),
  );

  return process.env.NEXT_PUBLIC_DISCOVER_DEV_EXAMPLE_POSTS === "1"
    ? [...getDevExampleDiscoverPosts(), ...postsFromDb]
    : postsFromDb;
}
