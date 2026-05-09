import type { Route } from "next";
import type { Course } from "@prisma/client";
import { ChevronRight, Pin } from "lucide-react";

import { inboxConversationTileClassName } from "@/components/inbox/inbox-conversation-tile";
import { InboxUnreadBadge } from "@/components/inbox/inbox-unread-badge";
import { InboxSwipeRow } from "@/components/inbox/inbox-swipe-row";
import { CourseAvatar } from "@/components/ui/course-avatar";
import { formatShortRelativeTime } from "@/lib/format/short-relative-time";
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
  const when = last?.createdAt ?? userCourse.updatedAt;
  const fromMe = last?.senderId === userId;
  const preview = last?.body
    ? `${fromMe ? "You: " : `${last.sender.nickname ?? "Someone"}: `}${last.body}`
    : "Course chat — say hi to the class";
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
              {course.name}
            </p>
            {pinned ? (
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-[#FEF3C7] text-[#D97706] dark:bg-amber-950/45 dark:text-amber-200"
                aria-label="Pinned"
              >
                <Pin className="h-2.5 w-2.5" strokeWidth={2} aria-hidden />
              </span>
            ) : null}
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
          <time className="shrink-0 text-xs tabular-nums text-[#8A94A6] dark:text-zinc-500" dateTime={when.toISOString()}>
            {formatShortRelativeTime(when)}
          </time>
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
