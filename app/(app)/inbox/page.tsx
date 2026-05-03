import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import type { ReactNode } from "react";
import type { Course, CourseRoomMessage, User } from "@prisma/client";
import { formatDistanceToNowStrict } from "date-fns";
import { ChevronRight, MessageCircle, Send, UserRound } from "lucide-react";

import { DirectInboxRow } from "@/components/inbox/direct-inbox-row";
import { CourseAvatar } from "@/components/ui/course-avatar";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { GuestAppCta } from "@/components/app/guest-app-cta";
import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { ConnectionStatus, FriendLinkStatus } from "@prisma/client";

type ConnectionInbox = Awaited<
  ReturnType<
    typeof prisma.connection.findMany<{
      include: {
        userA: true;
        userB: true;
        invitation: { include: { course: true } };
        originCourse: true;
        messages: { orderBy: { createdAt: "desc" }; take: 1; include: { sender: true } };
        _count: { select: { messages: true } };
      };
    }>
  >
>[number];

type UserCourseWithCourse = Awaited<
  ReturnType<
    typeof prisma.userCourse.findMany<{
      include: { course: true };
    }>
  >
>[number];

type CourseRoomMessageWithSender = CourseRoomMessage & { sender: User };

type InboxMerged =
  | { kind: "direct"; sortAt: Date; connection: ConnectionInbox }
  | {
      kind: "course";
      sortAt: Date;
      course: Course;
      userCourse: UserCourseWithCourse;
      last: CourseRoomMessageWithSender | undefined;
    };

export default async function InboxPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) {
    return (
      <div className="space-y-5">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Contacts</h1>
          <p className="text-sm text-muted-foreground">Chats, course rooms, and people you can reach</p>
        </header>
        <GuestAppCta
          returnTo="/inbox"
          headline="Sign in to see contacts"
          body="Your inbox syncs across devices once you log in."
        />
      </div>
    );
  }
  if (!sessionUser.onboardingComplete) {
    redirect("/onboarding");
  }
  const user = sessionUser;

  const [contactsCount, connections, userCourses] = await Promise.all([
    prisma.friendLink.count({
      where: {
        status: FriendLinkStatus.ACCEPTED,
        connection: {
          status: ConnectionStatus.ACTIVE,
          OR: [{ userAId: user.id }, { userBId: user.id }],
        },
      },
    }),
    prisma.connection.findMany({
      where: {
        status: "ACTIVE",
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
      include: {
        userA: true,
        userB: true,
        invitation: { include: { course: true } },
        originCourse: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: { sender: true },
        },
        _count: { select: { messages: true } },
      },
      orderBy: { updatedAt: "desc" },
    }),
    prisma.userCourse.findMany({
      where: { userId: user.id },
      include: { course: true },
    }),
  ]);

  const courseIds = userCourses.map((uc) => uc.courseId);
  const courseMessages =
    courseIds.length > 0
      ? await prisma.courseRoomMessage.findMany({
          where: { courseId: { in: courseIds } },
          orderBy: { createdAt: "desc" },
          include: { sender: true },
          take: 400,
        })
      : [];

  const lastCourseMessageByCourseId = new Map<string, CourseRoomMessageWithSender>();
  for (const m of courseMessages) {
    if (!lastCourseMessageByCourseId.has(m.courseId)) {
      lastCourseMessageByCourseId.set(m.courseId, m);
    }
  }

  const merged: InboxMerged[] = [
    ...connections.map((connection) => ({
      kind: "direct" as const,
      sortAt: connection.messages[0]?.createdAt ?? connection.updatedAt,
      connection,
    })),
    ...userCourses.map((uc) => ({
      kind: "course" as const,
      sortAt: lastCourseMessageByCourseId.get(uc.courseId)?.createdAt ?? uc.updatedAt,
      course: uc.course,
      userCourse: uc,
      last: lastCourseMessageByCourseId.get(uc.courseId),
    })),
  ].sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime());

  const firstMessageConnections = connections.filter(
    (connection) => connection._count.messages === 1 && connection.messages[0],
  );
  const toReplyCount = firstMessageConnections.filter(
    (connection) => connection.messages[0]?.senderId !== user.id,
  ).length;
  const fromYouCount = firstMessageConnections.filter(
    (connection) => connection.messages[0]?.senderId === user.id,
  ).length;

  return (
    <div className="space-y-5">
      <header className="space-y-1 px-0.5">
        <h1 className="text-[1.375rem] font-semibold tracking-tight text-foreground">Contacts</h1>
        <p className="text-[13px] leading-snug text-muted-foreground">
          Course chats and direct conversations
        </p>
      </header>

      <section className="grid grid-cols-3 gap-2.5">
        <InboxShortcut
          href="/inbox/to-reply"
          icon={<MessageCircle className="h-5 w-5" strokeWidth={2} aria-hidden />}
          label="To reply"
          count={toReplyCount}
        />
        <InboxShortcut
          href="/inbox/from-you"
          icon={<Send className="h-5 w-5" strokeWidth={2} aria-hidden />}
          label="From you"
          count={fromYouCount}
        />
        <InboxShortcut
          href="/inbox/contacts"
          icon={<UserRound className="h-5 w-5" strokeWidth={2} aria-hidden />}
          label="Contacts"
        />
      </section>

      <section className="space-y-2">
        {merged.length ? (
          <ul className="overflow-hidden rounded-[1.125rem] border border-border/60 bg-card shadow-[0_2px_16px_-4px_rgba(15,23,42,0.06)]">
            {merged.map((item) =>
              item.kind === "direct" ? (
                <DirectInboxRow key={item.connection.id} userId={user.id} connection={item.connection} />
              ) : (
                <CourseInboxRow
                  key={item.course.id}
                  userId={user.id}
                  course={item.course}
                  userCourse={item.userCourse}
                  last={item.last}
                />
              ),
            )}
          </ul>
        ) : (
          <EmptyState
            title="No conversations yet"
            description="Join a course to see its group chat, or start a direct chat from Discover."
          />
        )}
      </section>
    </div>
  );
}

function InboxShortcut({
  href,
  icon,
  label,
  count,
}: {
  href: Route;
  icon: ReactNode;
  label: string;
  count?: number;
}) {
  return (
    <Link
      href={href}
      className="flex min-h-[4.75rem] flex-col items-center justify-center gap-1.5 rounded-[1rem] border border-border/60 bg-card px-2.5 py-2.5 text-center shadow-[0_2px_12px_-4px_rgba(15,23,42,0.06)] transition-colors active:bg-muted/40 [@media(hover:hover)]:hover:bg-muted/30"
    >
      <span className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/12 text-primary">
        {icon}
        {(count ?? 0) > 0 ? (
          <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-rose-500 px-1 py-0.5 text-[10px] font-semibold leading-none text-white">
            {count}
          </span>
        ) : null}
      </span>
      <p className="max-w-full truncate text-[12px] font-semibold leading-tight">{label}</p>
    </Link>
  );
}

function CourseInboxRow({
  userId,
  course,
  userCourse,
  last,
}: {
  userId: string;
  course: Course;
  userCourse: UserCourseWithCourse;
  last: CourseRoomMessageWithSender | undefined;
}) {
  const when = last?.createdAt ?? userCourse.updatedAt;
  const fromMe = last?.senderId === userId;
  const preview = last?.body
    ? `${fromMe ? "You: " : `${last.sender.nickname ?? "Someone"}: `}${last.body}`
    : "Course chat — say hi to the class";
  const unread = Boolean(last && !fromMe);

  return (
    <li className="border-b border-border/50 last:border-b-0">
      <Link
        href={`/courses/${course.id}/chat?returnTo=%2Finbox` as Route}
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
