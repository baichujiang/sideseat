import type { InboxMerged } from "@/lib/queries/inbox-merge";
import { isConnectionPinned } from "@/lib/queries/inbox-order";

export function inboxRowKey(item: InboxMerged): string {
  return item.kind === "direct"
    ? `direct:${item.connection.id}`
    : item.kind === "course"
      ? `course:${item.course.id}`
      : `group:${item.groupChat.id}`;
}

export function itemPinned(item: InboxMerged, userId: string): boolean {
  return item.kind === "direct"
    ? isConnectionPinned(item.connection, userId)
    : item.kind === "course"
      ? Boolean(item.userCourse.inboxPinnedAt)
      : false;
}

/**
 * Pinned vs Recent only: unpinned threads (including unread) sort together by last activity.
 * Unread stays visible on rows and via the “New” shortcut chip on Chats.
 */
export function partitionInboxSections(merged: InboxMerged[], userId: string) {
  const pinned: InboxMerged[] = [];
  const recent: InboxMerged[] = [];
  for (const item of merged) {
    if (itemPinned(item, userId)) pinned.push(item);
    else recent.push(item);
  }
  const bySort = (a: InboxMerged, b: InboxMerged) => b.sortAt.getTime() - a.sortAt.getTime();
  pinned.sort(bySort);
  recent.sort(bySort);
  return { pinned, recent };
}
