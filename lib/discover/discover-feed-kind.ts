import { isSameDay } from "date-fns";

import type { DiscoverPostRow } from "@/lib/discover/discover-post-row";

/** Feed tabs for buddy-finding (MVP). No Following — see Phase 3 / UserFollow. */
export type DiscoverFeedKind = "for-you" | "today" | "nearby" | "latest";

const FEED_PARAM_VALUES: DiscoverFeedKind[] = ["for-you", "today", "nearby", "latest"];

export function parseDiscoverFeedKind(raw: string | null): DiscoverFeedKind {
  const v = (raw ?? "").toLowerCase();
  if (v === "nearby") return "for-you";
  return FEED_PARAM_VALUES.includes(v as DiscoverFeedKind) ? (v as DiscoverFeedKind) : "for-you";
}

export function discoverFeedKindToParam(kind: DiscoverFeedKind): string {
  return kind;
}

/**
 * Phase 3 (not in MVP): BuddyRequestParticipant, OPEN/FULL, UserFollow + Following tab,
 * richer For You ranking, server pagination.
 */

function sortByCreatedDesc<T extends DiscoverPostRow>(posts: T[]): T[] {
  return [...posts].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

function sortByExpiresDesc<T extends DiscoverPostRow>(posts: T[]): T[] {
  return [...posts].sort((a, b) => new Date(b.expiresAt).getTime() - new Date(a.expiresAt).getTime());
}

/** “Today” = created calendar-today (server already returns active-only). */
export function filterDiscoverFeedPosts<T extends DiscoverPostRow>(posts: T[], feed: DiscoverFeedKind): T[] {
  const now = new Date();
  switch (feed) {
    case "latest":
      return sortByCreatedDesc(posts);
    case "today":
      return sortByCreatedDesc(posts.filter((p) => isSameDay(new Date(p.createdAt), now)));
    case "nearby":
      // Same city as server query; later: geo radius.
      return sortByCreatedDesc(posts);
    case "for-you":
    default:
      return sortByExpiresDesc(
        [...posts].sort((a, b) => (a.isOwn === b.isOwn ? 0 : a.isOwn ? 1 : -1)),
      );
  }
}
