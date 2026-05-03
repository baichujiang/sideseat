import Link from "next/link";
import type { Route } from "next";
import type { Course } from "@prisma/client";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronRight } from "lucide-react";

import { CourseAvatar } from "@/components/ui/course-avatar";
import { cn } from "@/lib/utils";
import type { CourseRoomMessageWithSender } from "@/lib/queries/inbox-merge";

type UserCourseWithCourse = {
  courseId: string;
  updatedAt: Date;
  course: Course;
};

export function CourseInboxRow({
  userId,
  course,
  userCourse,
  last,
  returnTo = "/inbox",
}: {
  userId: string;
  course: Course;
  userCourse: UserCourseWithCourse;
  last: CourseRoomMessageWithSender | undefined;
  returnTo?: string;
}) {
  const when = last?.createdAt ?? userCourse.updatedAt;
  const fromMe = last?.senderId === userId;
  const preview = last?.body
    ? `${fromMe ? "You: " : `${last.sender.nickname ?? "Someone"}: `}${last.body}`
    : "Course chat — say hi to the class";
  const unread = Boolean(last && !fromMe);
  const returnEnc = encodeURIComponent(returnTo);

  return (
    <li className="border-b border-border/50 last:border-b-0">
      <Link
        href={`/courses/${course.id}/chat?returnTo=${returnEnc}` as Route}
        className="flex min-h-[4.25rem] items-center gap-3.5 px-4 py-3.5 transition-colors active:bg-muted/50 [@media(hover:hover)]:hover:bg-muted/45"
      >
        <CourseAvatar
          id={course.id}
          code={course.code}
          name={course.name}
          size={52}
          className="ring-2 ring-background"
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className="truncate text-[15px] font-semibold leading-tight text-foreground">
              {course.name}
            </p>
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
      </Link>
    </li>
  );
}
