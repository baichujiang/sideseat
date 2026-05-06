import type { Route } from "next";
import { ChevronRight, UsersRound } from "lucide-react";

import { InboxUnreadBadge } from "@/components/inbox/inbox-unread-badge";
import { inboxConversationTileClassName } from "@/components/inbox/inbox-conversation-tile";
import { formatShortRelativeTime } from "@/lib/format/short-relative-time";
import { groupChatDisplayTitle } from "@/lib/group-chats/title";
import type { InboxMerged } from "@/lib/queries/inbox-merge";
import { cn } from "@/lib/utils";
import Link from "next/link";

type GroupInboxItem = Extract<InboxMerged, { kind: "group" }>;

export function GroupInboxRow({
  userId,
  item,
  returnTo = "/inbox",
}: {
  userId: string;
  item: GroupInboxItem;
  returnTo?: string;
}) {
  const { groupChat, last, unreadCount } = item;
  const title = groupChatDisplayTitle(
    groupChat.title,
    groupChat.participants.map((participant) => participant.user),
    userId,
  );
  const preview = last?.body?.trim() || "Start the conversation";
  const when = last?.createdAt ?? groupChat.updatedAt;
  const participantCount = groupChat.participants.length;
  const href = `/groups/${groupChat.id}?returnTo=${encodeURIComponent(returnTo)}` as Route;

  return (
    <li className={inboxConversationTileClassName}>
      <Link href={href} className="flex items-center gap-3 rounded-[26px] px-4 py-3 active:bg-muted/40">
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-classmates-blue-soft/80 text-classmates-blue shadow-sm">
          <UsersRound className="h-6 w-6" strokeWidth={2.2} aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[17px] font-bold leading-tight tracking-tight text-[#111827] dark:text-foreground">
            {title}
          </p>
          <p
            className={cn(
              "mt-1 truncate text-[15px] leading-snug text-[#5F6B7A] dark:text-zinc-400",
              unreadCount > 0 && "font-semibold text-[#374151] dark:text-zinc-300",
            )}
          >
            {preview}
          </p>
          <p className="mt-1 truncate text-[11px] text-muted-foreground">
            {participantCount} member{participantCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-center">
          <time className="shrink-0 text-sm tabular-nums text-[#8A94A6] dark:text-zinc-500" dateTime={when.toISOString()}>
            {formatShortRelativeTime(when)}
          </time>
          {unreadCount > 0 ? (
            unreadCount === 1 ? (
              <InboxUnreadBadge count={1} variant="dot" />
            ) : (
              <InboxUnreadBadge count={unreadCount} variant="count" />
            )
          ) : null}
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#A1A9B5] dark:text-zinc-500" strokeWidth={2} aria-hidden />
        </div>
      </Link>
    </li>
  );
}
