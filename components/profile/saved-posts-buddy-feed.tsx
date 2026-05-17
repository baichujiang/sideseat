"use client";

import { BuddyRequestCard } from "@/components/discover/buddy-request-card";
import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";
import {
  DiscoverPostsMasonry,
  DiscoverPostsMasonryItem,
} from "@/components/profile/discover-posts-masonry";

export function SavedPostsBuddyFeed({ posts }: { posts: DiscoverPostRow[] }) {
  return (
    <DiscoverPostsMasonry>
      {posts.map((post) => (
        <DiscoverPostsMasonryItem key={post.id}>
          <BuddyRequestCard post={post} returnTo="/profile/saved-posts" />
        </DiscoverPostsMasonryItem>
      ))}
    </DiscoverPostsMasonry>
  );
}
