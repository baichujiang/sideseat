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
        <CourseAvatar id={course.id} code={course.code} name={course.name} size={52} className="shrink-0 ring-2 ring-background" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <p
              className={cn(
                "min-w-0 truncate text-[17px] font-bold leading-tight tracking-tight text-[#111827]",
                "dark:text-foreground",
              )}
            >
              {course.name}
            </p>
            {pinned ? (
              <span
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#FEF3C7] text-[#D97706] dark:bg-amber-950/45 dark:text-amber-200"
                aria-label="Pinned"
              >
                <Pin className="h-3 w-3" strokeWidth={2} aria-hidden />
              </span>
            ) : null}
          </div>
          <p
            className={cn(
              "mt-1 truncate text-[15px] leading-snug text-[#5F6B7A] dark:text-zinc-400",
              isUnread && "font-semibold text-[#374151] dark:text-zinc-300",
            )}
          >
            {preview}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2 self-center">
          <time className="shrink-0 text-sm tabular-nums text-[#8A94A6] dark:text-zinc-500" dateTime={when.toISOString()}>
            {formatShortRelativeTime(when)}
          </time>
          {isUnread ? (
            unreadCount === 1 ? (
              <InboxUnreadBadge count={1} variant="dot" />
            ) : (
              <InboxUnreadBadge count={unreadCount} variant="count" />
            )
          ) : null}
          <ChevronRight className="h-[18px] w-[18px] shrink-0 text-[#A1A9B5] dark:text-zinc-500" strokeWidth={2} aria-hidden />
        </div>
      </InboxSwipeRow>
    </li>
  );
}
