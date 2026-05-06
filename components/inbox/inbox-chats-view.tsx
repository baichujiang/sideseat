"use client";

import type { ReactNode } from "react";
import { useDeferredValue, useMemo, useState } from "react";
import { Search } from "lucide-react";

import { DirectInboxRow } from "@/components/inbox/direct-inbox-row";
import { CourseInboxRow } from "@/components/inbox/course-inbox-row";
import { GroupInboxRow } from "@/components/inbox/group-inbox-row";
import { EmptyState } from "@/components/ui/empty-state";
import { inboxChatMatchesQuery } from "@/lib/inbox/inbox-chat-search";
import { inboxRowKey, partitionInboxSections } from "@/lib/inbox/partition-inbox-sections";
import type { InboxMerged } from "@/lib/queries/inbox-merge";

export function InboxChatsView({ userId, merged }: { userId: string; merged: InboxMerged[] }) {
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
          placeholder="Search chats"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          aria-label="Search chats"
          className="min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-[#8A94A6] dark:placeholder:text-muted-foreground"
        />
      </div>

      {merged.length === 0 ? (
        <EmptyState
          title="No conversations yet"
          description="Join a course, add a contact, or start a group chat to see conversations here."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matches"
          description={hasQuery ? `Nothing matches “${query.trim()}”. Try another name or course.` : undefined}
        />
      ) : (
        <div className="space-y-6">
          {pinned.length > 0 ? (
            <InboxSection title="Pinned" headingId="inbox-section-pinned">
              {pinned.map((item) => (
                <InboxMergedRow key={inboxRowKey(item)} userId={userId} item={item} />
              ))}
            </InboxSection>
          ) : null}
          {recent.length > 0 ? (
            <InboxSection title="Recent" headingId="inbox-section-recent">
              {recent.map((item) => (
                <InboxMergedRow key={inboxRowKey(item)} userId={userId} item={item} />
              ))}
            </InboxSection>
          ) : null}
        </div>
      )}
    </div>
  );
}

function InboxSection({
  title,
  headingId,
  children,
}: {
  title: string;
  headingId: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-2.5" aria-labelledby={headingId} role="region">
      <h2
        id={headingId}
        className="px-0.5 text-[12px] font-semibold uppercase tracking-[0.18em] text-[#5F6B7A] dark:text-zinc-400"
      >
        {title}
      </h2>
      <ul className="space-y-2">{children}</ul>
    </section>
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
