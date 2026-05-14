"use client";

import { DiscoverPostCard } from "@/components/discover/discover-post-card";
import {
  discoverSceneForPostCategory,
  type DiscoverPostRow,
} from "@/lib/discover/discover-post-row";
import type { ViewerCourseMatchIndex } from "@/lib/discover/viewer-course-match";

export function SavedPostsDiscoverList({
  posts,
  viewerCourseMatchIndex,
}: {
  posts: DiscoverPostRow[];
  viewerCourseMatchIndex: ViewerCourseMatchIndex;
}) {
  return (
    <ul className="space-y-2.5">
      {posts.map((post) => (
        <li key={post.id}>
          <DiscoverPostCard
            post={post}
            scene={discoverSceneForPostCategory(post.category)}
            viewerCourseMatchIndex={viewerCourseMatchIndex}
            listReturnTo="/profile/saved-posts"
          />
        </li>
      ))}
    </ul>
  );
}
