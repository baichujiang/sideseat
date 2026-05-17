import { ClassmatePostCategory } from "@prisma/client";

import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";

/** Client-side buddy type filter (categories only). */
export function applyBuddyFeedClientFilters(
  posts: DiscoverPostRow[],
  categories: ClassmatePostCategory[] | null,
): DiscoverPostRow[] {
  if (!categories?.length) return posts;
  const set = new Set(categories);
  return posts.filter((p) => set.has(p.category));
}
