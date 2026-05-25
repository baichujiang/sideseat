"use client";

import { BuddyRequestCard } from "@/components/discover/buddy-request-card";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";

export function DiscoverFeed({
  posts,
}: {
  posts: DiscoverPostRow[];
}) {
  if (posts.length === 0) return null;

  return (
    <div className="space-y-3">
      {posts.map((post) => (
        <BuddyRequestCard key={post.id} post={post} />
      ))}
    </div>
  );
}
