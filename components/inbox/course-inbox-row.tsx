import Link from "next/link";
import type { Route } from "next";
import type { Course } from "@prisma/client";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronRight, Pin } from "lucide-react";

import { InboxUnreadBadge } from "@/components/inbox/inbox-unread-badge";
import { InboxSwipeRow } from "@/components/inbox/inbox-swipe-row";
import { CourseAvatar } from "@/components/ui/course-avatar";
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
  const unread = unreadCount > 0;
  const returnEnc = encodeURIComponent(returnTo);
  const href = `/courses/${course.id}/chat?returnTo=${returnEnc}` as Route;
  const pinned = Boolean(userCourse.inboxPinnedAt);

  return (
    <li
      className={cn(
        "border-b border-border/50 last:border-b-0",
        pinned ? "bg-amber-50/80 dark:bg-amber-500/10" : "",
      )}
    >
      <InboxSwipeRow href={href} returnTo={returnTo} pinned={pinned} swipeTarget={{ type: "course", courseId: course.id }}>
        <CourseAvatar
          id={course.id}
          code={course.code}
          name={course.name}
          size={52}
          className="ring-2 ring-background"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <div className="flex min-w-0 items-center gap-1.5">
              {pinned ? (
                <Pin className="h-3.5 w-3.5 shrink-0 fill-amber-500 text-amber-500" strokeWidth={2} aria-hidden />
              ) : null}
              <p className="truncate text-[15px] font-semibold leading-tight text-foreground">{course.name}</p>
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
          <InboxUnreadBadge count={unreadCount} />
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
