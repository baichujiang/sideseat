import Link from "next/link";
import type { Route } from "next";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";

import { CourseChatComposer } from "@/components/chat/course-chat-composer";
import { ChatReplyProvider } from "@/components/chat/chat-reply-context";
import { ChatRealtimeRefresh } from "@/components/chat/chat-realtime-refresh";
import { ChatScrollContainer } from "@/components/chat/chat-scroll-container";
import { ChatThreadSearchButton } from "@/components/chat/chat-thread-search-button";
import { MessageActionMenu } from "@/components/chat/message-action-menu";
import { MessageBubbleContent } from "@/components/chat/message-bubble-content";
import { BackLink } from "@/components/nav/back-link";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { requireCourseChatMember } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { cn } from "@/lib/utils";
import { getSchoolLabel } from "@/lib/constants/schools";
import { courseChatHeadline } from "@/lib/courses/course-code-label";
import { formatMessage, getMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { resolveBackHref } from "@/lib/nav/back";
import { chatMessageDomId } from "@/lib/chat/chat-message-dom-id";
import { indexPlainTextMessagesForSearch } from "@/lib/chat/thread-search-index";

export default async function CourseChatPage({
  params,
  searchParams,
}: {
  params: Promise<{ courseId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { courseId } = await params;
  const query = (await searchParams) ?? {};
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const c = ui.courses;
  const dateLocale = locale === "zh-CN" ? zhCN : enUS;
  const { user, course, userCourse } = await requireCourseChatMember(courseId);

  function dayDividerLabel(d: Date): string {
    if (isToday(d)) return ui.chat.today;
    if (isYesterday(d)) return ui.chat.yesterday;
    return format(d, "PPP", { locale: dateLocale });
  }

  function timeLabel(d: Date): string {
    return format(d, "HH:mm");
  }

  /**
   * Hide messages from anyone:
   *  - currently moderation-blocked (platform-level), or
   *  - mutually blocked with the current user (either direction).
   * The composer enforces the same rules on POST; this is the read-side mirror.
   */
  const [hiddenIds, messages, memberCount] = await Promise.all([
    Promise.all([
      prisma.moderationBlock.findMany({
        where: { isActive: true },
        select: { userId: true },
      }),
      prisma.block.findMany({
        where: {
          OR: [{ blockerId: user.id }, { blockedId: user.id }],
        },
        select: { blockerId: true, blockedId: true },
      }),
    ]).then(([modBlocks, mutualBlocks]) => {
      const ids = new Set<string>();
      for (const b of modBlocks) ids.add(b.userId);
      for (const b of mutualBlocks) {
        ids.add(b.blockerId === user.id ? b.blockedId : b.blockerId);
      }
      return ids;
    }),
    prisma.courseRoomMessage.findMany({
      where: { courseId },
      include: {
        sender: true,
        replyTo: { include: { sender: true } },
      },
      orderBy: { createdAt: "asc" },
    }),
    prisma.userCourse.count({ where: { courseId } }),
  ]);

  const visibleMessages = messages.filter((m) => !hiddenIds.has(m.senderId));
  const threadSearchEntries = indexPlainTextMessagesForSearch(visibleMessages);
  const latestMessageId = visibleMessages.at(-1)?.id ?? null;

  const membersFragment =
    memberCount === 1 ? c.chatClassmatesOne : formatMessage(c.chatClassmatesMany, { count: memberCount });
  const chatSubtitle = formatMessage(c.courseChatSubtitle, {
    membersFragment,
    school: getSchoolLabel(course.school),
  });

  return (
    <ChatReplyProvider>
    <ChatRealtimeRefresh kind="course" courseId={courseId} latestMessageId={latestMessageId} />
    <div className="flex h-full min-h-0 flex-1 flex-col bg-[#F6F8FB] dark:bg-[#090B10]">
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200/75 bg-white/95 px-2 py-2 backdrop-blur-sm dark:border-border dark:bg-background/95">
        <BackLink returnTo={query.returnTo} fallback={`/courses/${courseId}`} />
        <Link
          href={`/courses/${courseId}`}
          className="flex min-w-0 flex-1 flex-col rounded-xl py-1 pl-1 pr-2 text-left transition hover:bg-muted/70 active:bg-muted"
        >
          <p className="truncate text-sm font-semibold leading-tight">
            {courseChatHeadline(course.name, course.code)}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">{chatSubtitle}</p>
        </Link>
        <ChatThreadSearchButton entries={threadSearchEntries} />
      </header>

      {userCourse.inboxHiddenAt ? (
        <div className="shrink-0 border-b border-amber-200/70 bg-amber-50/60 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/25">
          <form
            action={`/api/courses/${courseId}/inbox-restore`}
            method="post"
            className="flex flex-wrap items-center gap-2"
          >
            <input
              type="hidden"
              name="returnTo"
              value={`/courses/${courseId}/chat`}
            />
            <p className="min-w-0 flex-1 text-[11px] leading-snug text-foreground">{c.chatHiddenBanner}</p>
            <button
              type="submit"
              className="shrink-0 rounded-full border border-border bg-background px-2.5 py-1 text-[10px] font-semibold shadow-sm"
            >
              {c.showInChats}
            </button>
          </form>
        </div>
      ) : null}

      <ChatScrollContainer messageCount={visibleMessages.length}>
        {visibleMessages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm font-medium text-foreground">{c.chatEmptyTitle}</p>
            <p className="mt-1 max-w-[18rem] text-xs leading-relaxed text-muted-foreground">{c.chatEmptyBody}</p>
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            {visibleMessages.map((message, index) => {
              const isOwn = message.senderId === user.id;
              const showDay =
                index === 0 || !isSameDay(message.createdAt, visibleMessages[index - 1]!.createdAt);
              const peerHref =
                `/users/${message.senderId}?returnTo=${encodeURIComponent(`/courses/${courseId}/chat`)}` as Route;

              return (
                <div key={message.id} id={chatMessageDomId(message.id)}>
                  {showDay ? (
                    <div className="flex justify-center py-2">
                      <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">
                        {dayDividerLabel(message.createdAt)}
                      </span>
                    </div>
                  ) : null}

                  <div
                    className={cn(
                      "group flex items-start gap-2",
                      isOwn ? "justify-end" : "justify-start",
                    )}
                  >
                    {!isOwn ? (
                      <Link
                        href={peerHref}
                        className="mt-5 shrink-0 rounded-full transition hover:opacity-90 active:opacity-80"
                        aria-label={formatMessage(c.memberViewProfileAria, {
                          name: message.sender.nickname ?? ui.common.studentFallback,
                        })}
                      >
                        <PresetAvatar id={message.sender.avatarUrl} size={32} />
                      </Link>
                    ) : null}
                    {isOwn ? (
                      <MessageActionMenu
                        anchorClassName="mt-6"
                        isOwn
                        message={{
                          id: message.id,
                          body: message.body,
                          senderName: message.sender.nickname,
                          senderId: message.senderId,
                        }}
                        target={{
                          kind: "course",
                          courseId,
                          messageId: message.id,
                        }}
                      />
                    ) : null}
                    <div
                      className={cn(
                        "max-w-[min(100%,20rem)] shrink",
                        isOwn ? "text-right" : "text-left",
                      )}
                    >
                      {isOwn ? (
                        <p className="mb-0.5 truncate pr-0.5 text-[11px] font-medium text-muted-foreground">
                          {c.chatBubbleYou}
                        </p>
                      ) : (
                        <Link
                          href={peerHref}
                          className="mb-0.5 block truncate pl-0.5 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
                        >
                          {message.sender.nickname ?? ui.common.studentFallback}
                        </Link>
                      )}
                      <div
                        className={cn(
                          "inline-block px-3.5 py-2 text-[15px] leading-snug text-left",
                          isOwn
                            ? "rounded-[1.25rem] rounded-br-md bg-primary text-primary-foreground"
                            : "rounded-[1.25rem] rounded-bl-md bg-muted text-foreground",
                        )}
                      >
                        <MessageBubbleContent
                          isOwn={isOwn}
                          payload={{ kind: "text", body: message.body }}
                          deleted={message.deletedAt != null}
                          reply={
                            message.replyTo
                              ? {
                                  senderName: message.replyTo.sender?.nickname ?? null,
                                  body: message.replyTo.body,
                                  deleted: message.replyTo.deletedAt != null,
                                }
                              : null
                          }
                        />
                      </div>
                      <time
                        className={cn(
                          "mt-0.5 block text-[10px] text-muted-foreground",
                          isOwn ? "pr-0.5" : "pl-0.5",
                        )}
                        dateTime={message.createdAt.toISOString()}
                      >
                        {timeLabel(message.createdAt)}
                      </time>
                    </div>
                    {!isOwn ? (
                      <MessageActionMenu
                        anchorClassName="mt-6"
                        isOwn={false}
                        message={{
                          id: message.id,
                          body: message.body,
                          senderName: message.sender.nickname,
                          senderId: message.senderId,
                        }}
                        target={{
                          kind: "course",
                          courseId,
                          messageId: message.id,
                        }}
                      />
                    ) : null}
                    {isOwn ? (
                      <Link
                        href={"/me" as Route}
                        className="mt-5 shrink-0 rounded-full transition hover:opacity-90 active:opacity-80"
                        aria-label={c.chatViewYourProfileAria}
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

      <div
        data-testid="chat-composer-footer"
        className="shrink-0 border-t border-slate-200/75 bg-white/95 px-3 pb-[var(--chat-composer-padding-bottom)] pt-2.5 shadow-[0_-4px_24px_rgba(15,23,42,0.045)] backdrop-blur-sm dark:border-border/60 dark:bg-background/90 dark:shadow-[0_-4px_24px_rgba(0,0,0,0.2)]"
      >
        <CourseChatComposer courseId={courseId} />
      </div>
    </div>
    </ChatReplyProvider>
  );
}
