"use client";

import { BuddyRequestCard } from "@/components/discover/buddy-request-card";
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
    <div className="columns-2 gap-2.5 sm:gap-3 [column-fill:balance]">
      {posts.map((post) => (
        <div key={post.id} className="mb-2.5 break-inside-avoid sm:mb-3">
          <BuddyRequestCard post={post} cityNameKey={cityNameKey} />
        </div>
      ))}
    </div>
  );
}
