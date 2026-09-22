import { isRetiredSystemUser } from "@/lib/auth/retired-system-users";
import type { InboxMerged } from "@/lib/queries/inbox-merge";

/** Same ordering/filtering as the inbox page list before version or render. */
export function prepareInboxListMerged(merged: InboxMerged[]): InboxMerged[] {
  return merged.filter(
    (item) =>
      item.kind !== "direct" ||
      (!isRetiredSystemUser(item.connection.userA) &&
        !isRetiredSystemUser(item.connection.userB)),
  );
}

/** Stable fingerprint for poll vs SSR — must use {@link prepareInboxListMerged} first. */
export function buildInboxListVersion(
  merged: InboxMerged[],
  plansNeedingYourAction: number,
): string {
  const listVersion = merged
    .map((item) => {
      if (item.kind === "direct") {
        return [
          "direct",
          item.connection.id,
          item.connection.messages[0]?.id ?? "none",
          item.unreadCount,
          item.sortAt.toISOString(),
        ].join(":");
      }

      if (item.kind === "course") {
        return [
          "course",
          item.course.id,
          item.last?.id ?? "none",
          item.unreadCount,
          item.sortAt.toISOString(),
        ].join(":");
      }

      return [
        "group",
        item.groupChat.id,
        item.last?.id ?? "none",
        item.unreadCount,
        item.sortAt.toISOString(),
      ].join(":");
    })
    .join("|");

  return `${listVersion}|plans:${plansNeedingYourAction}`;
}
