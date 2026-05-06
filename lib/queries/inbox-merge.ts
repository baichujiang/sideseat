import type { Course, CourseRoomMessage, User } from "@prisma/client";
import { ClassmatePostStatus, ConnectionStatus, PlanRequestStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { inboxCourseUnreadCounts, inboxDirectUnreadCounts } from "@/lib/queries/inbox-unread-counts";
import {
  compareConnectionsForInbox,
  isConnectionPinned,
} from "@/lib/queries/inbox-order";

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
        planRequests: {
          where: { status: "PENDING" },
          take: 4,
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, receiverUserId: true, proposerUserId: true },
        };
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

export type CourseRoomMessageWithSender = CourseRoomMessage & { sender: User };

export type InboxMerged =
  | { kind: "direct"; sortAt: Date; connection: ConnectionInbox; unreadCount: number }
  | {
      kind: "course";
      sortAt: Date;
      course: Course;
      userCourse: UserCourseWithCourse;
      last: CourseRoomMessageWithSender | undefined;
      unreadCount: number;
    };

export type InboxMergeBundle = {
  merged: InboxMerged[];
  unreadTotal: number;
  /** Plan requests where you are the receiver and must accept / decline / counter. */
  plansNeedingYourAction: number;
  activePostCount: number;
};

/** Same total as {@link InboxMergeBundle.unreadTotal}, without loading merged rows (for nav badges). */
export async function getInboxUnreadTotal(userId: string): Promise<number> {
  const [connections, userCourses] = await Promise.all([
    prisma.connection.findMany({
      where: {
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }],
      },
      select: { id: true },
    }),
    prisma.userCourse.findMany({
      where: { userId, inboxHiddenAt: null },
      select: { courseId: true },
    }),
  ]);

  const connectionIds = connections.map((c) => c.id);
  const courseIds = userCourses.map((uc) => uc.courseId);
  const [directUnread, courseUnread] = await Promise.all([
    inboxDirectUnreadCounts(userId, connectionIds),
    inboxCourseUnreadCounts(userId, courseIds),
  ]);

  let unreadTotal = 0;
  for (const id of connectionIds) unreadTotal += directUnread.get(id) ?? 0;
  for (const id of courseIds) unreadTotal += courseUnread.get(id) ?? 0;
  return unreadTotal;
}

export async function getInboxMergeBundle(userId: string): Promise<InboxMergeBundle> {
  const [connections, userCourses, activePostCount, plansNeedingYourAction] = await Promise.all([
    prisma.connection.findMany({
      where: {
        status: ConnectionStatus.ACTIVE,
        OR: [{ userAId: userId }, { userBId: userId }],
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
        planRequests: {
          where: { status: "PENDING" },
          take: 4,
          orderBy: { updatedAt: "desc" },
          select: { id: true, title: true, receiverUserId: true, proposerUserId: true },
        },
      },
    }),
    prisma.userCourse.findMany({
      where: { userId, inboxHiddenAt: null },
      include: { course: true },
    }),
    prisma.classmatePost.count({
      where: {
        userId,
        status: ClassmatePostStatus.ACTIVE,
        expiresAt: { gt: new Date() },
      },
    }),
    prisma.planRequest.count({
      where: {
        connection: {
          status: ConnectionStatus.ACTIVE,
          OR: [{ userAId: userId }, { userBId: userId }],
        },
        receiverUserId: userId,
        status: PlanRequestStatus.PENDING,
      },
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

  const connectionIds = connections.map((c) => c.id);
  const [directUnread, courseUnread] = await Promise.all([
    inboxDirectUnreadCounts(userId, connectionIds),
    inboxCourseUnreadCounts(userId, courseIds),
  ]);

  const merged: InboxMerged[] = [
    ...connections
      .sort((a, b) =>
        compareConnectionsForInbox(
          a,
          b,
          userId,
          (value) => value.messages[0]?.createdAt ?? value.updatedAt,
        ),
      )
      .map((connection) => ({
        kind: "direct" as const,
        sortAt: connection.messages[0]?.createdAt ?? connection.updatedAt,
        connection,
        unreadCount: directUnread.get(connection.id) ?? 0,
      })),
    ...userCourses.map((uc) => ({
      kind: "course" as const,
      sortAt: lastCourseMessageByCourseId.get(uc.courseId)?.createdAt ?? uc.updatedAt,
      course: uc.course,
      userCourse: uc,
      last: lastCourseMessageByCourseId.get(uc.courseId),
      unreadCount: courseUnread.get(uc.courseId) ?? 0,
    })),
  ].sort((a, b) => {
    const aPinned =
      a.kind === "direct" ? isConnectionPinned(a.connection, userId) : Boolean(a.userCourse.inboxPinnedAt);
    const bPinned =
      b.kind === "direct" ? isConnectionPinned(b.connection, userId) : Boolean(b.userCourse.inboxPinnedAt);

    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    return b.sortAt.getTime() - a.sortAt.getTime();
  });

  let unreadTotal = 0;
  for (const id of connectionIds) unreadTotal += directUnread.get(id) ?? 0;
  for (const id of courseIds) unreadTotal += courseUnread.get(id) ?? 0;

  return {
    merged,
    unreadTotal,
    plansNeedingYourAction,
    activePostCount,
  };
}
