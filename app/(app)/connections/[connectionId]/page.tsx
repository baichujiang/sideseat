import Link from "next/link";
import type { Route } from "next";
import { format, isSameDay, isToday, isYesterday } from "date-fns";
import { enUS, zhCN } from "date-fns/locale";
import { MessageCircle } from "lucide-react";

import { AvailabilityCardMessage } from "@/components/chat/availability-card-message";
import { ScheduleShareCardMessage } from "@/components/chat/schedule-share-card-message";
import { AssistantMessageBody } from "@/components/chat/assistant-message-body";
import { AssistantQuickReplies } from "@/components/chat/assistant-quick-replies";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatReplyProvider } from "@/components/chat/chat-reply-context";
import { ChatRealtimeRefresh } from "@/components/chat/chat-realtime-refresh";
import { DirectMessageList } from "@/components/chat/direct-message-list";
import { ChatThreadSearchButton } from "@/components/chat/chat-thread-search-button";
import { MessageActionMenu } from "@/components/chat/message-action-menu";
import { MessageBubbleContent } from "@/components/chat/message-bubble-content";
import {
  PlanConfirmedCardMessage,
  PlanRequestCardMessage,
} from "@/components/chat/plan-request-card-message";
import { BackLink } from "@/components/nav/back-link";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { isAssistantBotUser } from "@/lib/auth/assistant-bot";
import { displayUserMessageBody } from "@/lib/assistant/display-user-message";
import { requireConnection } from "@/lib/auth/guards";
import { directMessageActionSnippet } from "@/lib/chat/direct-message-preview";
import { contactRemarkForViewer } from "@/lib/connections/contact-remark";
import { selfNotesDisplayTitle } from "@/lib/connections/self-notes-title";
import { resolveBackHref } from "@/lib/nav/back";
import { formatMessage, getMessages, type AppMessages } from "@/lib/i18n/messages";
import { getServerAppLocale } from "@/lib/i18n/server-locale";
import { chatMessageDomId } from "@/lib/chat/chat-message-dom-id";
import { indexConnectionMessagesForSearch } from "@/lib/chat/thread-search-index";
import { prisma } from "@/lib/db/prisma";
import { loadScheduleShareChatPreviewsForMessages } from "@/lib/schedule-share/load-chat-preview-server";
import { plainTokenFromScheduleShareRecipientUrl } from "@/lib/schedule-share/share-link-urls";
import { cn } from "@/lib/utils";

function dayDividerLabel(d: Date, chat: AppMessages["chat"], dfLocale: typeof enUS): string {
  if (isToday(d)) return chat.today;
  if (isYesterday(d)) return chat.yesterday;
  return format(d, "MMM d, yyyy", { locale: dfLocale });
}

function timeLabel(d: Date): string {
  return format(d, "HH:mm");
}

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60000;
}

function isStandardBubbleMessage(type: string): boolean {
  return type !== "SYSTEM" && !type.endsWith("_CARD");
}

export default async function ConnectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ connectionId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { connectionId } = await params;
  const query = (await searchParams) ?? {};
  const { connection, user } = await requireConnection(connectionId);
  const locale = await getServerAppLocale();
  const ui = getMessages(locale);
  const dfLocale = locale === "zh-CN" ? zhCN : enUS;
  const isSelfNotes = connection.userAId === connection.userBId;
  const otherUser = connection.userAId === user.id ? connection.userB : connection.userA;
  const isAssistantChat = !isSelfNotes && isAssistantBotUser(otherUser);

  const courseName = connection.invitation?.course?.name ?? null;
  const myRemark = contactRemarkForViewer(connection, user.id);
  const peerNickname = otherUser.nickname?.trim() ?? "";
  const selfBaseLabel = selfNotesDisplayTitle(user, null);
  const headerTitle = isSelfNotes
    ? selfNotesDisplayTitle(user, myRemark)
    : (myRemark || peerNickname || "Student");
  const showPeerNicknameLine =
    !isSelfNotes && Boolean(myRemark) && myRemark !== peerNickname && peerNickname.length > 0;
  const showSelfBaseLine = isSelfNotes && Boolean(myRemark) && headerTitle !== selfBaseLabel;
  const peerStatusLine =
    !isAssistantChat && !isSelfNotes
      ? courseName || (showPeerNicknameLine ? peerNickname : `@${otherUser.username}`)
      : null;
  const messages = connection.messages;
  const scheduleSharePreviewByToken = await loadScheduleShareChatPreviewsForMessages(
    prisma,
    messages,
    user.id,
  );
  const threadSearchEntries = indexConnectionMessagesForSearch(messages);
  const latestMessageId = messages.at(-1)?.id ?? null;
  const hasViewerMessage = isAssistantChat
    ? messages.some((message) => message.senderId === user.id)
    : false;
  const firstAssistantQuickReplyMessageId =
    isAssistantChat && !hasViewerMessage
      ? (messages.find((message) => message.type === "TEXT" && isAssistantBotUser(message.sender))?.id ?? null)
      : null;
  const profileLinkHref = isAssistantChat
    ? null
    : isSelfNotes
      ? (`/profile?returnTo=${encodeURIComponent(`/connections/${connectionId}`)}` as Route)
      : (`/users/${otherUser.id}?returnTo=${encodeURIComponent(`/connections/${connectionId}`)}` as Route);
  const peerHref = profileLinkHref;
  const messageMetas = messages.map((message) => ({
    id: message.id,
    senderId: message.senderId,
  }));

  return (
    <ChatReplyProvider>
    <ChatRealtimeRefresh
      kind="direct"
      connectionId={connection.id}
      latestMessageId={latestMessageId}
    />
    <div className="flex h-full max-h-[100dvh] min-h-0 flex-1 flex-col overflow-hidden bg-[#F6F8FB] dark:bg-[#090B10]">
      {/* Chat app bar */}
      <header className="flex shrink-0 items-center gap-2 border-b border-slate-200/75 bg-white/95 px-2 py-2 backdrop-blur-sm dark:border-border dark:bg-background/95">
        <BackLink returnTo={query.returnTo} fallback="/inbox" label={ui.chat.back} />
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 pl-1 pr-2">
          {profileLinkHref ? (
            <Link
              href={profileLinkHref}
              className="shrink-0 rounded-full transition hover:opacity-90 active:opacity-80"
              aria-label={
                isSelfNotes
                  ? ui.chat.openYourProfileAria
                  : formatMessage(ui.chat.openPeerProfileAria, {
                      name: peerNickname || otherUser.username,
                    })
              }
            >
              <PresetAvatar id={otherUser.avatarUrl} size={40} className="shrink-0" />
            </Link>
          ) : (
            <PresetAvatar id={otherUser.avatarUrl} size={40} className="shrink-0" />
          )}
          <div className="min-w-0 flex-1">
            {profileLinkHref ? (
              <Link
                href={profileLinkHref}
                className="min-w-0 rounded-md py-0.5 text-left transition hover:bg-muted/70 active:bg-muted"
              >
                <p className="truncate text-sm font-semibold leading-tight">{headerTitle}</p>
              </Link>
            ) : (
              <p className="truncate text-sm font-semibold leading-tight">{headerTitle}</p>
            )}
            {isAssistantChat ? (
              <p className="truncate text-[11px] text-muted-foreground">{ui.assistant.headerSubtitle}</p>
            ) : null}
            {showSelfBaseLine ? (
              <p className="truncate text-[11px] text-muted-foreground">{selfBaseLabel}</p>
            ) : null}
            {peerStatusLine ? (
              <p className="truncate text-[11px] text-muted-foreground">{peerStatusLine}</p>
            ) : null}
          </div>
          {isAssistantChat ? (
            <span className="shrink-0 rounded-full bg-classmates-azure/10 px-2 py-0.5 text-[10px] font-semibold text-classmates-azure dark:bg-sky-900/30 dark:text-sky-300">
              {ui.assistant.officialBadge}
            </span>
          ) : null}
        </div>
        <ChatThreadSearchButton entries={threadSearchEntries} />
      </header>

      <DirectMessageList
        messages={messageMetas}
        currentUserId={user.id}
        newMessageLabel={ui.chat.newMessagesBadge}
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-muted/80 text-muted-foreground/70">
              <MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />
            </span>
            <p className="text-sm font-medium text-foreground">{ui.chat.noMessagesYet}</p>
            <p className="max-w-[14rem] text-xs leading-relaxed text-muted-foreground">
              {isAssistantChat ? ui.assistant.composerPlaceholder : ui.chat.placeholderWrite}
            </p>
          </div>
        ) : (
          <div className="pb-2">
            {messages.map((message, index) => {
              const previousMessage = messages[index - 1];
              const nextMessage = messages[index + 1];
              const showDay =
                index === 0 ||
                !isSameDay(message.createdAt, messages[index - 1]!.createdAt);
              const showTimestamp =
                index === 0 ||
                showDay ||
                minutesBetween(message.createdAt, messages[index - 1]!.createdAt) >= 10;
              const canGroupWithPrevious =
                Boolean(previousMessage) &&
                !showTimestamp &&
                previousMessage?.senderId === message.senderId &&
                isStandardBubbleMessage(previousMessage.type) &&
                isStandardBubbleMessage(message.type) &&
                minutesBetween(message.createdAt, previousMessage.createdAt) < 5;
              const canGroupWithNext =
                Boolean(nextMessage) &&
                nextMessage?.senderId === message.senderId &&
                isStandardBubbleMessage(nextMessage.type) &&
                isStandardBubbleMessage(message.type) &&
                isSameDay(message.createdAt, nextMessage!.createdAt) &&
                minutesBetween(nextMessage!.createdAt, message.createdAt) < 5;

              const dayStrip = showDay ? (
                <div className="flex justify-center py-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">
                    {dayDividerLabel(message.createdAt, ui.chat, dfLocale)}
                  </span>
                </div>
              ) : null;
              const timeStrip = showTimestamp ? (
                <div className={cn("flex justify-center", showDay ? "pb-1" : "py-2")}>
                  <time
                    dateTime={message.createdAt.toISOString()}
                    className="rounded-full bg-black/[0.04] px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground dark:bg-white/10"
                  >
                    {timeLabel(message.createdAt)}
                  </time>
                </div>
              ) : null;

              if (message.type === "SCHEDULE_SHARE_CARD" && message.body.trim()) {
                const ownerDisplay =
                  message.sender.nickname?.trim() || message.sender.username || ui.common.studentFallback;
                const shareToken = plainTokenFromScheduleShareRecipientUrl(message.body.trim());
                return (
                  <div key={message.id} id={chatMessageDomId(message.id)} className="mt-3 first:mt-0">
                    {dayStrip}
                    {timeStrip}
                    <ScheduleShareCardMessage
                      shareUrl={message.body.trim()}
                      ownerName={ownerDisplay}
                      isOwner={message.senderId === user.id}
                      returnTo={`/connections/${connectionId}`}
                      initialPreview={
                        shareToken ? (scheduleSharePreviewByToken.get(shareToken) ?? null) : null
                      }
                    />
                  </div>
                );
              }

              if (message.type === "AVAILABILITY_CARD" && message.availabilityShare) {
                return (
                  <div key={message.id} id={chatMessageDomId(message.id)} className="mt-3 first:mt-0">
                    {dayStrip}
                    {timeStrip}
                    <AvailabilityCardMessage
                      shareId={message.availabilityShare.id}
                      ownerName={
                        message.availabilityShare.owner.nickname ??
                        message.availabilityShare.owner.username
                      }
                      isOwner={message.availabilityShare.ownerUserId === user.id}
                    />
                  </div>
                );
              }

              if (message.type === "AVAILABILITY_CARD") {
                return (
                  <div key={message.id} id={chatMessageDomId(message.id)} className="mt-3 first:mt-0">
                    {dayStrip}
                    {timeStrip}
                    <div className="flex justify-center py-2">
                      <span className="max-w-sm rounded-full bg-muted px-3 py-1.5 text-center text-[11px] text-muted-foreground">
                        {ui.chat.availabilityOrphan}
                      </span>
                    </div>
                  </div>
                );
              }

              if (message.type === "PLAN_REQUEST_CARD" && message.planRequest) {
                const request = message.planRequest;
                return (
                  <div key={message.id} id={chatMessageDomId(message.id)} className="mt-3 first:mt-0">
                    {dayStrip}
                    {timeStrip}
                    <PlanRequestCardMessage
                      requestId={request.id}
                      proposerName={request.proposer.nickname ?? request.proposer.username}
                      receiverName={request.receiver.nickname ?? request.receiver.username}
                      viewerUserId={user.id}
                      proposerUserId={request.proposerUserId}
                      receiverUserId={request.receiverUserId}
                      title={request.title}
                      location={request.location}
                      message={request.message}
                      startTimeISO={request.startTime.toISOString()}
                      endTimeISO={request.endTime.toISOString()}
                      status={request.status}
                      fromScheduleShare={Boolean(request.scheduleShareLinkId)}
                    />
                  </div>
                );
              }

              if (message.type === "PLAN_CONFIRMED_CARD" && message.planRequest) {
                const request = message.planRequest;
                return (
                  <div key={message.id} id={chatMessageDomId(message.id)} className="mt-3 first:mt-0">
                    {dayStrip}
                    {timeStrip}
                    <PlanConfirmedCardMessage
                      title={request.title}
                      startTimeISO={request.startTime.toISOString()}
                      endTimeISO={request.endTime.toISOString()}
                    />
                  </div>
                );
              }

              if (message.type === "SYSTEM") {
                return (
                  <div key={message.id} id={chatMessageDomId(message.id)} className="mt-3 first:mt-0">
                    {dayStrip}
                    {timeStrip}
                    <div className="flex justify-center py-1">
                      <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
                        {message.body}
                      </span>
                    </div>
                  </div>
                );
              }

              const isOwn = message.senderId === user.id;
              const fromAssistant = isAssistantBotUser(message.sender);
              const actionSnippet = directMessageActionSnippet({
                type: message.type,
                body: message.body,
                locationName: message.locationName,
              });
              const bubblePayload =
                message.type === "IMAGE" && message.imageUrl
                  ? {
                      kind: "image" as const,
                      imageUrl: message.imageUrl,
                      caption: message.body,
                    }
                  : message.type === "LOCATION" &&
                      message.locationLat != null &&
                      message.locationLng != null
                    ? {
                        kind: "location" as const,
                        lat: message.locationLat,
                        lng: message.locationLng,
                        name: message.locationName,
                        caption: message.body,
                      }
                    : {
                        kind: "text" as const,
                        body: isOwn ? displayUserMessageBody(message.body, locale) : message.body,
                      };

              const bareImageChrome =
                message.deletedAt == null &&
                message.type === "IMAGE" &&
                Boolean(message.imageUrl);
              const showAssistantQuickReplies =
                firstAssistantQuickReplyMessageId === message.id &&
                fromAssistant &&
                bubblePayload.kind === "text" &&
                message.deletedAt == null;
              const showPeerAvatar = !isOwn && !canGroupWithNext;

              return (
                <div
                  key={message.id}
                  id={chatMessageDomId(message.id)}
                  className={cn("first:mt-0", canGroupWithPrevious ? "mt-1" : "mt-3")}
                >
                  {dayStrip}
                  {timeStrip}
                  <div
                    className={cn(
                      "group flex items-end gap-2",
                      isOwn ? "justify-end" : "justify-start",
                    )}
                  >
                    {!isOwn ? (
                      showPeerAvatar && peerHref ? (
                        <Link
                          href={peerHref}
                          className="shrink-0 rounded-full transition hover:opacity-90 active:opacity-80"
                          aria-label={formatMessage(ui.chat.openPeerProfileAria, {
                            name: otherUser.nickname?.trim() || ui.common.studentFallback,
                          })}
                        >
                          <PresetAvatar id={message.sender.avatarUrl} size={32} />
                        </Link>
                      ) : showPeerAvatar ? (
                        <PresetAvatar id={message.sender.avatarUrl} size={32} className="shrink-0" />
                      ) : (
                        <span className="h-8 w-8 shrink-0" aria-hidden />
                      )
                    ) : null}
                    {isOwn ? (
                      <MessageActionMenu
                        isOwn
                        message={{
                          id: message.id,
                          body: message.body,
                          actionSnippet,
                          senderName: message.sender.nickname,
                          senderId: message.senderId,
                        }}
                        target={{
                          kind: "direct",
                          connectionId: connection.id,
                          messageId: message.id,
                        }}
                      />
                    ) : null}
                    <div
                      className={cn(
                        "shrink text-sm leading-5",
                        showAssistantQuickReplies
                          ? "max-w-[78%] sm:max-w-[22rem]"
                          : "max-w-[78%] sm:max-w-[20rem]",
                        isOwn ? "text-right" : "text-left",
                      )}
                    >
                      <div
                        className={cn(
                          "inline-block text-left text-sm leading-5",
                          bareImageChrome
                            ? "max-w-[min(78vw,20rem)] p-0 align-top"
                            : cn(
                                "px-3.5 py-2.5",
                                isOwn
                                  ? cn(
                                      "rounded-[1.15rem] bg-primary text-primary-foreground",
                                      canGroupWithPrevious ? "rounded-tr-lg" : "rounded-tr-[1.15rem]",
                                      canGroupWithNext ? "rounded-br-lg" : "rounded-br-md",
                                    )
                                  : cn(
                                      "rounded-[1.15rem] bg-white text-foreground shadow-[0_1px_2px_rgba(15,23,42,0.06)] ring-1 ring-black/[0.04] dark:bg-zinc-900 dark:ring-white/10",
                                      canGroupWithPrevious ? "rounded-tl-lg" : "rounded-tl-[1.15rem]",
                                      canGroupWithNext ? "rounded-bl-lg" : "rounded-bl-md",
                                    ),
                              ),
                        )}
                      >
                        {fromAssistant && bubblePayload.kind === "text" && message.deletedAt == null ? (
                          <>
                            <AssistantMessageBody rawBody={bubblePayload.body} />
                            {showAssistantQuickReplies ? (
                              <AssistantQuickReplies
                                connectionId={connection.id}
                                surface="bubble"
                                className="mt-3 border-t border-border/60 pt-2.5"
                              />
                            ) : null}
                          </>
                        ) : (
                          <MessageBubbleContent
                            isOwn={isOwn}
                            surface={bareImageChrome ? "bareMedia" : "inBubble"}
                            payload={bubblePayload}
                            deleted={message.deletedAt != null}
                            reply={
                              message.replyTo
                                ? {
                                    senderName: message.replyTo.sender?.nickname ?? null,
                                    body: directMessageActionSnippet({
                                      type: message.replyTo.type,
                                      body: message.replyTo.body,
                                      locationName: message.replyTo.locationName,
                                    }),
                                    deleted: message.replyTo.deletedAt != null,
                                  }
                                : null
                            }
                          />
                        )}
                      </div>
                    </div>
                    {!isOwn ? (
                      <MessageActionMenu
                        isOwn={false}
                        message={{
                          id: message.id,
                          body: message.body,
                          actionSnippet,
                          senderName: message.sender.nickname,
                          senderId: message.senderId,
                        }}
                        target={{
                          kind: "direct",
                          connectionId: connection.id,
                          messageId: message.id,
                        }}
                      />
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </DirectMessageList>

      <div
        data-testid="chat-composer-footer"
        className="shrink-0 border-t border-slate-200/75 bg-white/95 px-3 pb-[var(--chat-composer-padding-bottom)] pt-2.5 shadow-[0_-4px_24px_rgba(15,23,42,0.045)] backdrop-blur-sm dark:border-border/60 dark:bg-background/90 dark:shadow-[0_-4px_24px_rgba(0,0,0,0.2)]"
      >
        <ChatComposer
          connectionId={connection.id}
          peerName={otherUser.nickname ?? "Student"}
          hideAttachments={isSelfNotes || isAssistantChat}
          placeholder={isAssistantChat ? ui.assistant.composerPlaceholder : undefined}
        />
      </div>
    </div>
    </ChatReplyProvider>
  );
}
