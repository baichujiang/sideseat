import type { Route } from "next";
import { ChevronRight } from "lucide-react";

import { InboxUnreadBadge } from "@/components/inbox/inbox-unread-badge";
import { inboxConversationTileClassName } from "@/components/inbox/inbox-conversation-tile";
import { GroupChatAvatarCollage } from "@/components/ui/group-chat-avatar-collage";
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
      <Link
        href={href}
        className="flex min-h-0 items-center gap-3 px-3 py-2.5 transition-colors active:bg-muted/40 [@media(hover:hover)]:hover:bg-muted/25"
      >
        <GroupChatAvatarCollage
          participants={groupChat.participants.map((participant) => ({
            userId: participant.userId,
            avatarUrl: participant.user.avatarUrl,
          }))}
          sizePx={44}
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold leading-tight text-[#111827] dark:text-foreground">
            {title}
          </p>
          <p
            className={cn(
              "mt-0.5 truncate text-[13px] leading-snug text-[#5F6B7A] dark:text-zinc-400",
              unreadCount > 0 && "font-semibold text-[#374151] dark:text-zinc-300",
            )}
          >
            {preview}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
            {participantCount} member{participantCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 self-center">
          <time className="shrink-0 text-xs tabular-nums text-[#8A94A6] dark:text-zinc-500" dateTime={when.toISOString()}>
            {formatShortRelativeTime(when)}
          </time>
          {unreadCount > 0 ? (
            unreadCount === 1 ? (
              <InboxUnreadBadge count={1} variant="dot" />
            ) : (
              <InboxUnreadBadge count={unreadCount} variant="count" />
            )
          ) : null}
          <ChevronRight className="h-4 w-4 shrink-0 text-[#A1A9B5] dark:text-zinc-500" strokeWidth={2} aria-hidden />
        </div>
      </Link>
    </li>
  );
}
