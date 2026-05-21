"use client";

import { useDeferredValue, useMemo } from "react";
import { DirectInboxRow } from "@/components/inbox/direct-inbox-row";
import { CourseInboxRow } from "@/components/inbox/course-inbox-row";
import { GroupInboxRow } from "@/components/inbox/group-inbox-row";
import { inboxChatListUlClassName } from "@/components/inbox/inbox-conversation-tile";
import { RecommendedClassmatesRail } from "@/components/classmates/recommended-classmates-rail";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage } from "@/lib/i18n/messages";
import { inboxChatMatchesQuery } from "@/lib/inbox/inbox-chat-search";
import { inboxRowKey, partitionInboxSections } from "@/lib/inbox/partition-inbox-sections";
import type { InboxMerged } from "@/lib/queries/inbox-merge";
import type { RecommendedClassmateRow } from "@/lib/queries/recommended-classmates";

export type InboxChatsEmptyKind = "group" | "course";

export function InboxChatsView({
  userId,
  merged,
  query,
  emptyKind,
  returnTo = "/inbox",
  recommendedClassmates = [],
}: {
  userId: string;
  merged: InboxMerged[];
  query: string;
  /** When the list is pre-filtered to one kind, use dedicated empty copy. */
  emptyKind?: InboxChatsEmptyKind;
  returnTo?: string;
  recommendedClassmates?: RecommendedClassmateRow[];
}) {
  const m = useAppMessages();
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filtered = useMemo(() => {
    if (!deferredQuery) return merged;
    return merged.filter((item) => inboxChatMatchesQuery(item, userId, deferredQuery));
  }, [merged, userId, deferredQuery]);

  const { pinned, recent } = useMemo(() => partitionInboxSections(filtered, userId), [filtered, userId]);

  const hasQuery = query.trim().length > 0;

  const emptyTitle =
    emptyKind === "group"
      ? m.inbox.studyGroupsEmptyTitle
      : emptyKind === "course"
        ? m.inbox.courseChatsEmptyTitle
        : m.inbox.emptyNoConversationsTitle;
  const emptyDesc =
    emptyKind === "group"
      ? m.inbox.studyGroupsEmptyDesc
      : emptyKind === "course"
        ? m.inbox.courseChatsEmptyDesc
        : m.inbox.emptyNoConversationsDesc;

  return (
    <div className="space-y-5">
      {merged.length === 0 ? (
        <div className="space-y-4">
          <EmptyState title={emptyTitle} description={emptyDesc} />
          {emptyKind == null && recommendedClassmates.length > 0 ? (
            <div className="space-y-2">
              <p className="px-0.5 text-center text-[12px] leading-snug text-muted-foreground">
                {m.inbox.recommendedClassmatesEmptyHint}
              </p>
              <RecommendedClassmatesRail
                rows={recommendedClassmates}
                title={m.courses.recommendedClassmatesTitle}
                returnTo={returnTo}
              />
            </div>
          ) : null}
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title={m.inbox.emptyNoMatchesTitle}
          description={
            hasQuery ? formatMessage(m.inbox.emptyNoMatchesDesc, { query: query.trim() }) : undefined
          }
        />
      ) : (
        <ul className={inboxChatListUlClassName}>
          {pinned.map((item) => (
            <InboxMergedRow key={inboxRowKey(item)} userId={userId} item={item} returnTo={returnTo} />
          ))}
          {recent.map((item) => (
            <InboxMergedRow key={inboxRowKey(item)} userId={userId} item={item} returnTo={returnTo} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxMergedRow({
  userId,
  item,
  returnTo,
}: {
  userId: string;
  item: InboxMerged;
  returnTo: string;
}) {
  return item.kind === "direct" ? (
    <DirectInboxRow
      userId={userId}
      connection={item.connection}
      unreadCount={item.unreadCount}
      returnTo={returnTo}
    />
  ) : item.kind === "course" ? (
    <CourseInboxRow
      userId={userId}
      course={item.course}
      userCourse={item.userCourse}
      last={item.last}
      unreadCount={item.unreadCount}
      returnTo={returnTo}
    />
  ) : (
    <GroupInboxRow userId={userId} item={item} returnTo={returnTo} />
  );
}
