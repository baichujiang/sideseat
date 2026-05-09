import { format, isSameDay, isToday, isYesterday } from "date-fns";
import Link from "next/link";
import type { Route } from "next";

import { GroupChatComposer } from "@/components/chat/group-chat-composer";
import { ChatRealtimeRefresh } from "@/components/chat/chat-realtime-refresh";
import { ChatScrollContainer } from "@/components/chat/chat-scroll-container";
import { MessageBubbleContent } from "@/components/chat/message-bubble-content";
import { BackLink } from "@/components/nav/back-link";
import { GroupChatAvatarCollage } from "@/components/ui/group-chat-avatar-collage";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { requireGroupChatParticipant } from "@/lib/auth/guards";
import { groupChatDisplayTitle } from "@/lib/group-chats/title";
import { safeReturnPath } from "@/lib/nav/back";
import { cn } from "@/lib/utils";

function dayDividerLabel(d: Date): string {
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "MMM d, yyyy");
}

function timeLabel(d: Date): string {
  return format(d, "HH:mm");
}

export default async function GroupChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ groupChatId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { groupChatId } = await params;
  const query = (await searchParams) ?? {};
  const backHref = safeReturnPath(query.returnTo, "/inbox");
  const { groupChat, user } = await requireGroupChatParticipant(groupChatId);
  const latestMessageId = groupChat.messages.at(-1)?.id ?? null;
  const title = groupChatDisplayTitle(
    groupChat.title,
    groupChat.participants.map((participant) => participant.user),
    user.id,
  );
  const groupThreadPath =
    query.returnTo != null && query.returnTo !== ""
      ? `/groups/${groupChat.id}?returnTo=${encodeURIComponent(query.returnTo)}`
      : `/groups/${groupChat.id}`;
  const groupThreadReturnToParam = encodeURIComponent(groupThreadPath);
  const infoHref =
    (`/groups/${groupChat.id}/info?returnTo=${encodeURIComponent(groupThreadPath)}` as Route);

  return (
    <>
      <ChatRealtimeRefresh kind="group" groupChatId={groupChat.id} latestMessageId={latestMessageId} />
      <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
        <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur-sm">
          <BackLink href={backHref} label="Back" />
          <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl py-1 pl-1 pr-2">
            <Link href={infoHref} className="shrink-0 transition hover:opacity-90 active:opacity-80">
              <GroupChatAvatarCollage
                participants={groupChat.participants.map((participant) => ({
                  userId: participant.userId,
                  avatarUrl: participant.user.avatarUrl,
                }))}
                sizePx={40}
              />
            </Link>
            <div className="min-w-0 flex-1">
              <Link href={infoHref} className="block min-w-0 rounded-md py-0.5 text-left transition hover:bg-muted/70 active:bg-muted">
                <p className="truncate text-sm font-semibold leading-tight">{title}</p>
              </Link>
              <p className="truncate text-[11px] text-muted-foreground">
                Group chat · {groupChat.participants.length} member{groupChat.participants.length === 1 ? "" : "s"}
              </p>
            </div>
            <Link
              href={infoHref}
              className="rounded-md px-2 py-1 text-xs font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground active:bg-muted/80"
            >
              Info
            </Link>
          </div>
        </header>

        <ChatScrollContainer messageCount={groupChat.messages.length}>
          {groupChat.messages.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
              <p className="text-sm font-medium text-foreground">No messages yet</p>
              <p className="mt-1 max-w-[18rem] text-xs leading-relaxed text-muted-foreground">
                Start the thread and bring everyone into the same plan.
              </p>
            </div>
          ) : (
            <div className="space-y-3 pb-2">
              {groupChat.messages.map((message, index) => {
                const isOwn = message.senderId === user.id;
                const peerProfileHref =
                  (`/users/${message.senderId}?returnTo=${groupThreadReturnToParam}` as Route);
                const selfProfileHref = (`/profile?returnTo=${groupThreadReturnToParam}` as Route);
                const showDay =
                  index === 0 || !isSameDay(message.createdAt, groupChat.messages[index - 1]!.createdAt);

                return (
                  <div key={message.id}>
                    {showDay ? (
                      <div className="flex justify-center py-2">
                        <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">
                          {dayDividerLabel(message.createdAt)}
                        </span>
                      </div>
                    ) : null}

                    <div className={cn("group flex items-start gap-2", isOwn ? "justify-end" : "justify-start")}>
                      {!isOwn ? (
                        <Link
                          href={peerProfileHref}
                          aria-label={`Open ${message.sender.nickname?.trim() || message.sender.username}'s profile`}
                          className="mt-5 shrink-0 rounded-full ring-offset-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <PresetAvatar id={message.sender.avatarUrl} size={32} />
                        </Link>
                      ) : null}
                      <div className={cn("max-w-[min(100%,20rem)] shrink", isOwn ? "text-right" : "text-left")}>
                        {isOwn ? (
                          <Link
                            href={selfProfileHref}
                            className="mb-0.5 block truncate pr-0.5 text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline"
                          >
                            You
                          </Link>
                        ) : (
                          <Link
                            href={peerProfileHref}
                            className={cn(
                              "mb-0.5 block truncate text-[11px] font-medium text-muted-foreground underline-offset-2 hover:underline pl-0.5",
                            )}
                          >
                            {message.sender.nickname?.trim() || message.sender.username}
                          </Link>
                        )}
                        <div
                          className={cn(
                            "inline-block rounded-[1.25rem] px-3.5 py-2 text-[15px] leading-snug text-left",
                            isOwn
                              ? "rounded-br-md bg-primary text-primary-foreground"
                              : "rounded-bl-md bg-muted text-foreground",
                          )}
                        >
                          <MessageBubbleContent
                            isOwn={isOwn}
                            payload={{ kind: "text", body: message.body }}
                            deleted={message.deletedAt != null}
                            reply={null}
                          />
                        </div>
                        <time
                          className={cn("mt-0.5 block text-[10px] text-muted-foreground", isOwn ? "pr-0.5" : "pl-0.5")}
                          dateTime={message.createdAt.toISOString()}
                        >
                          {timeLabel(message.createdAt)}
                        </time>
                      </div>
                      {isOwn ? (
                        <Link
                          href={selfProfileHref}
                          aria-label="Open your profile"
                          className="mt-5 shrink-0 rounded-full ring-offset-background transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                        >
                          <PresetAvatar id={user.avatarUrl} size={32} />
                        </Link>
                      ) : null}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ChatScrollContainer>

        <div className="shrink-0 border-t border-border/80 bg-background/95 px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
          <GroupChatComposer groupChatId={groupChat.id} />
        </div>
      </div>
    </>
  );
}
