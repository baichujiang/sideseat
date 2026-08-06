"use client";

import type { Route } from "next";
import type { Course } from "@prisma/client";
import { ChevronRight } from "lucide-react";

import { inboxConversationTileClassName } from "@/components/inbox/inbox-conversation-tile";
import { InboxRowTimestamp } from "@/components/inbox/inbox-row-timestamp";
import { InboxUnreadBadge } from "@/components/inbox/inbox-unread-badge";
import { InboxSwipeRow } from "@/components/inbox/inbox-swipe-row";
import { useLocaleContext } from "@/components/i18n/locale-provider";
import { CourseAvatar } from "@/components/ui/course-avatar";
import { courseChatHeadline } from "@/lib/courses/course-code-label";
import { cn } from "@/lib/utils";
import type { CourseRoomMessageWithSender } from "@/lib/queries/inbox-merge";

type UserCourseWithCourse = {
  courseId: string;
  updatedAt: Date;
  inboxPinnedAt: Date | null;
  course: Course;
};

export function CourseInboxRow({
  userId,
  course,
  userCourse,
  last,
  unreadCount,
  returnTo = "/inbox",
}: {
  userId: string;
  course: Course;
  userCourse: UserCourseWithCourse;
  last: CourseRoomMessageWithSender | undefined;
  unreadCount: number;
  returnTo?: string;
}) {
  const { messages } = useLocaleContext();
  const inbox = messages.inbox;
  const when = last?.createdAt ?? userCourse.updatedAt;
  const fromMe = last?.senderId === userId;
  const preview = last?.body
    ? `${fromMe ? `${inbox.youPrefix} ` : `${last.sender.nickname ?? inbox.someoneFallback}: `}${last.body}`
    : inbox.courseChatEmptyPreview;
  const isUnread = unreadCount > 0;
  const returnEnc = encodeURIComponent(returnTo);
  const href = `/courses/${course.id}/chat?returnTo=${returnEnc}` as Route;
  const pinned = Boolean(userCourse.inboxPinnedAt);

  return (
    <li className={inboxConversationTileClassName}>
      <InboxSwipeRow href={href} returnTo={returnTo} pinned={pinned} swipeTarget={{ type: "course", courseId: course.id }}>
        <CourseAvatar id={course.id} code={course.code} name={course.name} size={44} className="shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-1.5">
            <p
              className={cn(
                "min-w-0 truncate text-[15px] font-semibold leading-tight text-[#111827] dark:text-foreground",
              )}
            >
              {courseChatHeadline(course.name, course.code)}
            </p>
          </div>
          <p
            className={cn(
              "mt-0.5 truncate text-[13px] leading-snug text-[#5F6B7A] dark:text-zinc-400",
              isUnread && "font-semibold text-[#374151] dark:text-zinc-300",
            )}
          >
            {preview}
          </p>
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
