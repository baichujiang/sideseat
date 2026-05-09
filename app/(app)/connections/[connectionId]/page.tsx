import Link from "next/link";
import type { Route } from "next";
import { format, isSameDay, isToday, isYesterday } from "date-fns";

import { AvailabilityCardMessage } from "@/components/chat/availability-card-message";
import { ChatComposer } from "@/components/chat/chat-composer";
import { ChatReplyProvider } from "@/components/chat/chat-reply-context";
import { ChatRealtimeRefresh } from "@/components/chat/chat-realtime-refresh";
import { ChatScrollContainer } from "@/components/chat/chat-scroll-container";
import { MessageActionMenu } from "@/components/chat/message-action-menu";
import { MessageBubbleContent } from "@/components/chat/message-bubble-content";
import {
  PlanConfirmedCardMessage,
  PlanRequestCardMessage,
} from "@/components/chat/plan-request-card-message";
import { ContactRemarkEditor } from "@/components/chat/contact-remark-editor";
import { BackLink } from "@/components/nav/back-link";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { requireConnection } from "@/lib/auth/guards";
import { directMessageActionSnippet } from "@/lib/chat/direct-message-preview";
import { contactRemarkForViewer } from "@/lib/connections/contact-remark";
import { selfNotesDisplayTitle } from "@/lib/connections/self-notes-title";
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

export default async function ConnectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ connectionId: string }>;
  searchParams?: Promise<{ returnTo?: string }>;
}) {
  const { connectionId } = await params;
  const query = (await searchParams) ?? {};
  const backHref = safeReturnPath(query.returnTo, "/inbox");
  const { connection, user } = await requireConnection(connectionId);
  const isSelfNotes = connection.userAId === connection.userBId;
  const otherUser = connection.userAId === user.id ? connection.userB : connection.userA;

  const courseName = connection.invitation?.course?.name ?? null;
  const myRemark = contactRemarkForViewer(connection, user.id);
  const peerNickname = otherUser.nickname?.trim() ?? "";
  const selfBaseLabel = selfNotesDisplayTitle(user, null);
  const headerTitle = isSelfNotes
    ? selfNotesDisplayTitle(user, myRemark)
    : (myRemark || peerNickname || "Student");
  const showPeerNicknameLine =
    !isSelfNotes && Boolean(myRemark) && myRemark !== peerNickname && peerNickname.length > 0;
  const showPeerUsernameLine = !isSelfNotes && Boolean(myRemark) && !peerNickname.length;
  const showSelfBaseLine = isSelfNotes && Boolean(myRemark) && headerTitle !== selfBaseLabel;
  const messages = connection.messages;
  const latestMessageId = messages.at(-1)?.id ?? null;
  const profileLinkHref = isSelfNotes
    ? (`/profile?returnTo=${encodeURIComponent(`/connections/${connectionId}`)}` as Route)
    : (`/users/${otherUser.id}?returnTo=${encodeURIComponent(`/connections/${connectionId}`)}` as Route);
  const peerHref = profileLinkHref;

  return (
    <ChatReplyProvider>
    <ChatRealtimeRefresh
      kind="direct"
      connectionId={connection.id}
      latestMessageId={latestMessageId}
    />
    <div className="flex h-full min-h-0 flex-1 flex-col bg-background">
      {/* Chat app bar */}
      <header className="flex shrink-0 items-center gap-2 border-b border-border bg-background/95 px-2 py-2 backdrop-blur-sm">
        <BackLink href={backHref} label="Back" />
        <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl py-1 pl-1 pr-2">
          <Link
            href={profileLinkHref}
            className="shrink-0 rounded-full transition hover:opacity-90 active:opacity-80"
            aria-label={
              isSelfNotes
                ? "Open your profile"
                : `View ${peerNickname || otherUser.username}'s profile`
            }
          >
            <PresetAvatar id={otherUser.avatarUrl} size={40} className="shrink-0" />
          </Link>
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <Link
                href={profileLinkHref}
                className="min-w-0 rounded-md py-0.5 text-left transition hover:bg-muted/70 active:bg-muted"
              >
                <p className="truncate text-sm font-semibold leading-tight">{headerTitle}</p>
              </Link>
              <ContactRemarkEditor
                connectionId={connection.id}
                initialRemark={myRemark}
                isSelfNotes={isSelfNotes}
                variant="inline"
              />
            </div>
            {showSelfBaseLine ? (
              <p className="truncate text-[11px] text-muted-foreground">{selfBaseLabel}</p>
            ) : null}
            {showPeerNicknameLine ? (
              <p className="truncate text-[11px] text-muted-foreground">{peerNickname}</p>
            ) : null}
            {showPeerUsernameLine ? (
              <p className="truncate text-[11px] text-muted-foreground">@{otherUser.username}</p>
            ) : null}
            {!isSelfNotes && courseName ? (
              <p className="truncate text-[11px] text-muted-foreground">{courseName}</p>
            ) : null}
          </div>
        </div>
      </header>

      {!isSelfNotes ? (
        <div className="shrink-0 space-y-1 border-b border-border/70 bg-background/80 px-3 py-2">
          {courseName ? (
            <span className="inline-flex rounded-full bg-muted px-2.5 py-1 text-[11px] font-medium text-foreground/85">
              {courseName}
            </span>
          ) : null}
        </div>
      ) : null}

      <ChatScrollContainer messageCount={messages.length}>
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 py-16 text-center">
            <p className="text-sm font-medium text-foreground">No messages yet</p>
          </div>
        ) : (
          <div className="space-y-3 pb-2">
            {messages.map((message, index) => {
              const showDay =
                index === 0 ||
                !isSameDay(message.createdAt, messages[index - 1]!.createdAt);

              const dayStrip = showDay ? (
                <div className="flex justify-center py-2">
                  <span className="rounded-full bg-muted px-3 py-1 text-[10px] font-medium text-muted-foreground">
                    {dayDividerLabel(message.createdAt)}
                  </span>
                </div>
              ) : null;

              if (message.type === "AVAILABILITY_CARD" && message.availabilityShare) {
                return (
                  <div key={message.id}>
                    {dayStrip}
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

              if (message.type === "PLAN_REQUEST_CARD" && message.planRequest) {
                const request = message.planRequest;
                return (
                  <div key={message.id}>
                    {dayStrip}
                    <PlanRequestCardMessage
                      requestId={request.id}
                      proposerName={request.proposer.nickname ?? request.proposer.username}
                      receiverName={request.receiver.nickname ?? request.receiver.username}
                      viewerUserId={user.id}
                      proposerUserId={request.proposerUserId}
                      receiverUserId={request.receiverUserId}
                      planType={request.planType}
                      title={request.title}
                      location={request.location}
                      message={request.message}
                      startTimeISO={request.startTime.toISOString()}
                      endTimeISO={request.endTime.toISOString()}
                      status={request.status}
                    />
                  </div>
                );
              }

              if (message.type === "PLAN_CONFIRMED_CARD" && message.planRequest) {
                const request = message.planRequest;
                return (
                  <div key={message.id}>
                    {dayStrip}
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
                  <div key={message.id}>
                    {dayStrip}
                    <div className="flex justify-center py-1">
                      <span className="rounded-full bg-muted px-3 py-1 text-[11px] text-muted-foreground">
                        {message.body}
                      </span>
                    </div>
                  </div>
                );
              }

              const isOwn = message.senderId === user.id;
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
                    : { kind: "text" as const, body: message.body };

              return (
                <div key={message.id}>
                  {dayStrip}
                  <div
                    className={cn(
                      "group flex gap-2",
                      isOwn ? "justify-end" : "justify-start",
                    )}
                  >
                    {!isOwn ? (
                      <Link
                        href={peerHref}
                        className="mt-0.5 shrink-0 self-end rounded-full transition hover:opacity-90 active:opacity-80"
                        aria-label={`View ${otherUser.nickname?.trim() || "Student"}'s profile`}
                      >
                        <PresetAvatar id={message.sender.avatarUrl} size={32} />
                      </Link>
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
                        "max-w-[min(100%,20rem)] shrink",
                        isOwn ? "text-right" : "text-left",
                      )}
                    >
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
      </ChatScrollContainer>

      <div className="shrink-0 border-t border-border/80 bg-background/95 px-3 pt-2 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
        <ChatComposer
          connectionId={connection.id}
          peerName={otherUser.nickname ?? "Student"}
          hideAttachments={isSelfNotes}
        />
      </div>
    </div>
    </ChatReplyProvider>
  );
}
