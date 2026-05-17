"use client";

import { BuddyRequestCard } from "@/components/discover/buddy-request-card";
import {
  DiscoverPostsMasonry,
  DiscoverPostsMasonryItem,
} from "@/components/profile/discover-posts-masonry";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import type { DiscoverCityNameKey } from "@/lib/discover/discover-city-name-keys";

export function DiscoverFeed({
  posts,
  cityNameKey,
}: {
  posts: DiscoverPostRow[];
  cityNameKey: DiscoverCityNameKey;
}) {
  if (posts.length === 0) return null;

  return (
    <DiscoverPostsMasonry>
      {posts.map((post) => (
        <DiscoverPostsMasonryItem key={post.id}>
          <BuddyRequestCard post={post} cityNameKey={cityNameKey} />
        </DiscoverPostsMasonryItem>
      ))}
    </DiscoverPostsMasonry>
  );
}
