"use client";

import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { DirectInboxRow } from "@/components/inbox/direct-inbox-row";
import { CourseInboxRow } from "@/components/inbox/course-inbox-row";
import { GroupInboxRow } from "@/components/inbox/group-inbox-row";
import { inboxChatListUlClassName } from "@/components/inbox/inbox-conversation-tile";
import { EmptyState } from "@/components/ui/empty-state";
import { useAppMessages } from "@/hooks/use-app-locale";
import { formatMessage } from "@/lib/i18n/messages";
import { inboxChatMatchesQuery } from "@/lib/inbox/inbox-chat-search";
import { inboxRowKey, partitionInboxSections } from "@/lib/inbox/partition-inbox-sections";
import type { InboxMerged } from "@/lib/queries/inbox-merge";

export function InboxChatsView({ userId, merged }: { userId: string; merged: InboxMerged[] }) {
  const m = useAppMessages();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query.trim().toLowerCase());

  const filtered = useMemo(
    () =>
      deferredQuery ? merged.filter((item) => inboxChatMatchesQuery(item, userId, deferredQuery)) : merged,
    [merged, userId, deferredQuery],
  );

  const { pinned, recent } = useMemo(() => partitionInboxSections(filtered, userId), [filtered, userId]);

  const hasQuery = query.trim().length > 0;

  return (
    <div className="space-y-5">
      <div
        className="mt-5 flex items-center gap-3 rounded-[24px] border border-[#E7E0D6] bg-white px-5 py-3 dark:border-border dark:bg-card"
        role="search"
      >
        <Search size={20} className="shrink-0 text-[#8A94A6] dark:text-muted-foreground" aria-hidden />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={m.inbox.searchPlaceholder}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label={m.inbox.searchAria}
          className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-[#8A94A6] dark:placeholder:text-muted-foreground"
        />
      </div>

      {merged.length === 0 ? (
        <EmptyState title={m.inbox.emptyNoConversationsTitle} description={m.inbox.emptyNoConversationsDesc} />
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
            <InboxMergedRow key={inboxRowKey(item)} userId={userId} item={item} />
          ))}
          {recent.map((item) => (
            <InboxMergedRow key={inboxRowKey(item)} userId={userId} item={item} />
          ))}
        </ul>
      )}
    </div>
  );
}

function InboxMergedRow({ userId, item }: { userId: string; item: InboxMerged }) {
  return item.kind === "direct" ? (
    <DirectInboxRow userId={userId} connection={item.connection} unreadCount={item.unreadCount} />
  ) : item.kind === "course" ? (
    <CourseInboxRow
      userId={userId}
      course={item.course}
      userCourse={item.userCourse}
      last={item.last}
      unreadCount={item.unreadCount}
    />
  ) : (
    <GroupInboxRow userId={userId} item={item} />
  );
}
