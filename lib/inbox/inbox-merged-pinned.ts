import type { InboxMerged } from "@/lib/queries/inbox-merge";
import { isConnectionPinned } from "@/lib/queries/inbox-order";

/** Whether this thread is pinned for the viewer (DM / course / group use the same Chats rules). */
export function inboxMergedPinned(item: InboxMerged, userId: string): boolean {
  if (item.kind === "direct") return isConnectionPinned(item.connection, userId);
  if (item.kind === "course") return Boolean(item.userCourse.inboxPinnedAt);
  return Boolean(item.inboxPinnedAt);
}
