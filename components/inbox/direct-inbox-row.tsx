import Link from "next/link";
import type { Route } from "next";
import type { Course, Invitation, Message, User } from "@prisma/client";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronRight, Pin } from "lucide-react";

import { InboxSwipeRow } from "@/components/inbox/inbox-swipe-row";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { cn } from "@/lib/utils";

export type DirectInboxConnection = {
  id: string;
  userAId: string;
  userBId: string;
  updatedAt: Date;
  pinnedByAAt: Date | null;
  pinnedByBAt: Date | null;
  userA: User;
  userB: User;
  originCourse: Course | null;
  invitation: (Invitation & { course: Course }) | null;
  messages: Array<Message & { sender: User }>;
};

export function DirectInboxRow({
  userId,
  connection,
  returnTo = "/inbox",
}: {
  userId: string;
  connection: DirectInboxConnection;
  returnTo?: string;
}) {
  const isSelfNotes = connection.userAId === connection.userBId;
  const other = connection.userAId === userId ? connection.userB : connection.userA;
  const displayName = isSelfNotes ? "Notes to self" : (other.nickname ?? "Student");
  const lastMessage = connection.messages[0];
  const fromMe = lastMessage?.senderId === userId;
  const contextCourseName =
    connection.originCourse?.name ?? connection.invitation?.course?.name ?? null;
  const preview = lastMessage?.body
    ? `${fromMe ? "You: " : ""}${lastMessage.body}`
    : contextCourseName
      ? `Connected via ${contextCourseName}`
      : "Say hi";
  const when = lastMessage?.createdAt ?? connection.updatedAt;
  const unread = Boolean(lastMessage && !fromMe);
  const href = `/connections/${connection.id}?returnTo=${encodeURIComponent(returnTo)}` as Route;
  const pinned = connection.userAId === userId ? Boolean(connection.pinnedByAAt) : Boolean(connection.pinnedByBAt);

  return (
    <li
      className={cn(
        "border-b border-border/50 last:border-b-0",
        pinned ? "bg-amber-50/80 dark:bg-amber-500/10" : "",
      )}
    >
      <InboxSwipeRow href={href} connectionId={connection.id} returnTo={returnTo} pinned={pinned}>
        <PresetAvatar id={other.avatarUrl} size={52} className="ring-2 ring-background shadow-sm" />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {pinned ? (
                <Pin className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500" strokeWidth={2} aria-hidden />
              ) : null}
              <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
                {displayName}
              </p>
            </div>
            <time
              className="shrink-0 text-[11px] tabular-nums text-muted-foreground"
              dateTime={when.toISOString()}
            >
              {formatDistanceToNowStrict(when, { addSuffix: false })}
            </time>
          </div>
          <p
            className={cn(
              "mt-0.5 truncate text-[13px] leading-snug",
              unread ? "font-medium text-foreground/90" : "text-muted-foreground",
            )}
          >
            {preview}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5 pl-0.5">
          {unread ? (
            <span
              className="h-2 w-2 rounded-full bg-rose-500 shadow-[0_0_0_2px_hsl(var(--card))]"
              aria-label="Unread"
            />
          ) : null}
          <ChevronRight
            className="h-4 w-4 shrink-0 text-muted-foreground/45"
            strokeWidth={2}
            aria-hidden
          />
        </div>
      </InboxSwipeRow>
    </li>
  );
}
