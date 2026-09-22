"use client";

import type { Route } from "next";
import type { Course, Invitation, Message, PlanRequest, User } from "@prisma/client";
import { ChevronRight } from "lucide-react";

import { inboxConversationTileClassName } from "@/components/inbox/inbox-conversation-tile";
import { InboxRowTimestamp } from "@/components/inbox/inbox-row-timestamp";
import { InboxUnreadBadge } from "@/components/inbox/inbox-unread-badge";
import { InboxSwipeRow } from "@/components/inbox/inbox-swipe-row";
import { PresetAvatar } from "@/components/ui/preset-avatar";
import { selfNotesDisplayTitle } from "@/lib/connections/self-notes-title";
import { InboxDirectMessagePreview } from "@/components/inbox/inbox-direct-message-preview";
import { resolveInboxDirectPreview } from "@/lib/chat/inbox-direct-preview";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { cn } from "@/lib/utils";

export type DirectInboxConnection = {
  id: string;
  userAId: string;
  userBId: string;
  updatedAt: Date;
  pinnedByAAt: Date | null;
  pinnedByBAt: Date | null;
  contactRemarkByA: string | null;
  contactRemarkByB: string | null;
  userA: User;
  userB: User;
  originCourse: Course | null;
  invitation: (Invitation & { course: Course }) | null;
  messages: Array<
    Message & {
      sender: User;
      planRequest?: {
        title: string;
        startTime: Date;
        endTime: Date;
        status: import("@prisma/client").PlanRequestStatus;
        receiverUserId: string;
        proposerUserId: string;
      } | null;
    }
  >;
  planRequests?: Array<
    Pick<PlanRequest, "id" | "title" | "receiverUserId" | "proposerUserId">
  >;
};

export function DirectInboxRow({
  userId,
  connection,
  unreadCount,
  returnTo = "/inbox",
}: {
  userId: string;
  connection: DirectInboxConnection;
  unreadCount: number;
  returnTo?: string;
}) {
  const { locale, messages } = useLocaleContext();
  const isSelfNotes = connection.userAId === connection.userBId;
  const other = connection.userAId === userId ? connection.userB : connection.userA;
  const myRemark =
    connection.userAId === userId
      ? connection.contactRemarkByA?.trim()
      : connection.contactRemarkByB?.trim();
  const displayName = isSelfNotes
    ? selfNotesDisplayTitle(other, myRemark)
    : (myRemark || other.nickname?.trim() || messages.common.studentFallback);
  const lastMessage = connection.messages[0];
  const fromMe = lastMessage?.senderId === userId;
  const contextCourseName =
    connection.originCourse?.name ?? connection.invitation?.course?.name ?? null;
  const lastPreview =
    lastMessage != null
      ? resolveInboxDirectPreview(
          {
            type: lastMessage.type,
            body: lastMessage.body,
            locationName: lastMessage.locationName,
            planRequest: lastMessage.planRequest ?? null,
          },
          userId,
          locale,
        )
      : null;
  const when = lastMessage?.createdAt ?? connection.updatedAt;
  const isUnread = unreadCount > 0;
  const href = `/connections/${connection.id}?returnTo=${encodeURIComponent(returnTo)}` as Route;
  const pinned = connection.userAId === userId ? Boolean(connection.pinnedByAAt) : Boolean(connection.pinnedByBAt);

  const pendingPlan =
    connection.planRequests?.find((p) => p.receiverUserId === userId) ??
    connection.planRequests?.find((p) => p.proposerUserId === userId);
  const planChipLine = pendingPlan
    ? pendingPlan.receiverUserId === userId
      ? messages.inbox.planChipWaitingYou
      : messages.inbox.planChipWaitingThem
    : null;

  const lastMessageShowsPendingPlan =
    lastMessage?.type === "PLAN_REQUEST_CARD" &&
    lastMessage.planRequest?.status === "PENDING";
  const showPendingPlanChip = Boolean(planChipLine && pendingPlan && !lastMessageShowsPendingPlan);

  return (
    <li className={inboxConversationTileClassName}>
      <InboxSwipeRow
        href={href}
        returnTo={returnTo}
        pinned={pinned}
        swipeTarget={{ type: "direct", connectionId: connection.id }}
      >
        <PresetAvatar id={other.avatarUrl} size={44} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p
              className={cn(
                "min-w-0 truncate text-[15px] font-semibold leading-tight text-[#111827] dark:text-foreground",
              )}
            >
              {displayName}
            </p>
          </div>
          {lastPreview ? (
            <InboxDirectMessagePreview
              fromMe={fromMe}
              preview={lastPreview}
              emphasize={isUnread}
            />
          ) : (
            <p
              className={cn(
                "mt-0.5 truncate text-[13px] leading-snug text-[#5F6B7A] dark:text-zinc-400",
                isUnread && "font-semibold text-[#374151] dark:text-zinc-300",
              )}
            >
              {contextCourseName ? contextCourseName : messages.discover.sayHiCta}
            </p>
          )}
          {showPendingPlanChip && pendingPlan ? (
            <p className="mt-1">
              <span
                className={cn(
                  "inline-flex max-w-full items-center truncate rounded-full border px-2.5 py-0.5 text-[11px] font-medium leading-tight",
                  pendingPlan.receiverUserId === userId
                    ? "border-amber-200/90 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/35 dark:text-amber-100"
                    : "border-[#E7E0D6] bg-[#FAF9F6] text-[#5F6B7A] dark:border-border dark:bg-muted/35 dark:text-zinc-400",
                )}
              >
                {planChipLine}
              </span>
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 self-center">
          <InboxRowTimestamp at={when} />
          {isUnread ? (
            unreadCount === 1 ? (
              <InboxUnreadBadge count={1} variant="dot" />
            ) : (
              <InboxUnreadBadge count={unreadCount} variant="count" />
            )
          ) : null}
          <ChevronRight className="h-4 w-4 shrink-0 text-[#A1A9B5] dark:text-zinc-500" strokeWidth={2} aria-hidden />
        </div>
      </InboxSwipeRow>
    </li>
  );
}
