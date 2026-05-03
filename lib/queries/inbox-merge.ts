import type { Course, CourseRoomMessage, User } from "@prisma/client";
import { ClassmatePostStatus, ConnectionStatus, PlanRequestStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
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
  | { kind: "direct"; sortAt: Date; connection: ConnectionInbox }
  | {
      kind: "course";
      sortAt: Date;
      course: Course;
      userCourse: UserCourseWithCourse;
      last: CourseRoomMessageWithSender | undefined;
    };

export type InboxMergeBundle = {
  merged: InboxMerged[];
  unreadTotal: number;
  /** Plan requests where you are the receiver and must accept / decline / counter. */
  plansNeedingYourAction: number;
  activePostCount: number;
};

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
      },
    }),
    prisma.userCourse.findMany({
      where: { userId },
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
      })),
    ...userCourses.map((uc) => ({
      kind: "course" as const,
      sortAt: lastCourseMessageByCourseId.get(uc.courseId)?.createdAt ?? uc.updatedAt,
      course: uc.course,
      userCourse: uc,
      last: lastCourseMessageByCourseId.get(uc.courseId),
    })),
  ].sort((a, b) => {
    const aPinned = a.kind === "direct" ? isConnectionPinned(a.connection, userId) : false;
    const bPinned = b.kind === "direct" ? isConnectionPinned(b.connection, userId) : false;

    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    return b.sortAt.getTime() - a.sortAt.getTime();
  });

  const unreadDirectCount = connections.filter(
    (connection) => connection.messages[0] && connection.messages[0].senderId !== userId,
  ).length;
  const unreadCourseCount = userCourses.filter((uc) => {
    const last = lastCourseMessageByCourseId.get(uc.courseId);
    return Boolean(last && last.senderId !== userId);
  }).length;

  return {
    merged,
    unreadTotal: unreadDirectCount + unreadCourseCount,
    plansNeedingYourAction,
    activePostCount,
  };
}
