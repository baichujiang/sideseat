import type {
  Course,
  CourseRoomMessage,
  GroupChat,
  GroupChatMessage,
  Prisma,
  User,
} from "@prisma/client";
import { ConnectionStatus, PlanRequestStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import {
  inboxCourseUnreadCounts,
  inboxDirectUnreadCounts,
  inboxGroupUnreadCounts,
} from "@/lib/queries/inbox-unread-counts";
import { inboxMergedPinned } from "@/lib/inbox/inbox-merged-pinned";
import { compareConnectionsForInbox } from "@/lib/queries/inbox-order";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { RETIRED_SYSTEM_USERNAMES } from "@/lib/auth/retired-system-users";

function activeUserConnectionWhere(userId: string): Prisma.ConnectionWhereInput {
  return {
    status: ConnectionStatus.ACTIVE,
    userA: { username: { notIn: [...RETIRED_SYSTEM_USERNAMES] } },
    userB: { username: { notIn: [...RETIRED_SYSTEM_USERNAMES] } },
    OR: [{ userAId: userId }, { userBId: userId }],
  };
}

type ConnectionInbox = Awaited<
  ReturnType<
    typeof prisma.connection.findMany<{
      include: {
        userA: true;
        userB: true;
        invitation: { include: { course: true } };
        originCourse: true;
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            sender: true,
            planRequest: {
              select: {
                title: true,
                startTime: true,
                endTime: true,
                status: true,
                receiverUserId: true,
                proposerUserId: true,
              },
            },
          },
        },
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
export type GroupChatMessageWithSender = GroupChatMessage & { sender: User };

type GroupChatInbox = GroupChat & {
  participants: Array<{
    userId: string;
    joinedAt: Date;
    lastReadAt: Date | null;
    user: User;
  }>;
  messages: Array<GroupChatMessageWithSender>;
};

export type InboxMerged =
  | { kind: "direct"; sortAt: Date; connection: ConnectionInbox; unreadCount: number }
  | {
      kind: "course";
      sortAt: Date;
      course: Course;
      userCourse: UserCourseWithCourse;
      last: CourseRoomMessageWithSender | undefined;
      unreadCount: number;
    }
  | {
      kind: "group";
      sortAt: Date;
      groupChat: GroupChatInbox;
      /** Current viewer's membership — drives pin/hide like {@link UserCourse.inboxPinnedAt}. */
      inboxPinnedAt: Date | null;
      last: GroupChatMessageWithSender | undefined;
      unreadCount: number;
    };

export type InboxMergeBundle = {
  merged: InboxMerged[];
  unreadTotal: number;
  /** Plan requests where you are the receiver and must accept / decline / counter. */
  plansNeedingYourAction: number;
  /** Ended accepted Plans where this viewer has not privately answered Outcome. */
  planOutcomesNeedingYourResponse: number;
};

/** Same total as {@link InboxMergeBundle.unreadTotal}, without loading merged rows (for nav badges). */
export async function getInboxUnreadTotal(userId: string): Promise<number> {
  const [connections, userCourses, groupParticipants] = await Promise.all([
    prisma.connection.findMany({
      where: activeUserConnectionWhere(userId),
      select: { id: true },
    }),
    prisma.userCourse.findMany({
      where: { userId, inboxHiddenAt: null, ...activeCourseMembershipWhere() },
      select: { courseId: true },
    }),
    prisma.groupChatParticipant.findMany({
      where: { userId, inboxHiddenAt: null },
      select: { groupChatId: true },
    }),
  ]);

  const connectionIds = connections.map((c) => c.id);
  const courseIds = userCourses.map((uc) => uc.courseId);
  const groupChatIds = groupParticipants.map((p) => p.groupChatId);
  const [directUnread, courseUnread, groupUnread] = await Promise.all([
    inboxDirectUnreadCounts(userId, connectionIds),
    inboxCourseUnreadCounts(userId, courseIds),
    inboxGroupUnreadCounts(userId, groupChatIds),
  ]);

  let unreadTotal = 0;
  for (const id of connectionIds) unreadTotal += directUnread.get(id) ?? 0;
  for (const id of courseIds) unreadTotal += courseUnread.get(id) ?? 0;
  for (const id of groupChatIds) unreadTotal += groupUnread.get(id) ?? 0;
  return unreadTotal;
}

export async function getInboxMergeBundle(userId: string): Promise<InboxMergeBundle> {
  const now = new Date();
  const recentOutcomeCutoff = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1_000);
  const [
    connections,
    userCourses,
    groupParticipants,
    plansNeedingYourAction,
    planOutcomesNeedingYourResponse,
  ] = await Promise.all([
    prisma.connection.findMany({
      where: activeUserConnectionWhere(userId),
      include: {
        userA: true,
        userB: true,
        invitation: { include: { course: true } },
        originCourse: true,
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          include: {
            sender: true,
            planRequest: {
              select: {
                title: true,
                startTime: true,
                endTime: true,
                status: true,
                receiverUserId: true,
                proposerUserId: true,
              },
            },
          },
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
      where: { userId, inboxHiddenAt: null, ...activeCourseMembershipWhere() },
      include: { course: true },
    }),
    prisma.groupChatParticipant.findMany({
      where: { userId, inboxHiddenAt: null },
      include: {
        groupChat: {
          include: {
            participants: {
              include: { user: true },
              orderBy: { joinedAt: "asc" },
            },
            messages: {
              orderBy: { createdAt: "desc" },
              take: 1,
              include: { sender: true },
            },
          },
        },
      },
    }),
    prisma.planRequest.count({
      where: {
        connection: {
          ...activeUserConnectionWhere(userId),
        },
        receiverUserId: userId,
        status: PlanRequestStatus.PENDING,
      },
    }),
    prisma.planRequest.count({
      where: {
        connection: {
          ...activeUserConnectionWhere(userId),
          userA: { moderationBlocks: { none: { isActive: true } } },
          userB: { moderationBlocks: { none: { isActive: true } } },
        },
        AND: [
          {
            OR: [
              { commitmentId: null },
              { commitment: { is: { safetyRestrictedAt: null } } },
            ],
          },
          {
            status: PlanRequestStatus.ACCEPTED,
            endTime: { lte: now, gte: recentOutcomeCutoff },
            OR: [{ proposerUserId: userId }, { receiverUserId: userId }],
            outcomeResponses: { none: { userId } },
          },
        ],
      },
    }),
  ]);

  const courseIds = userCourses.map((uc) => uc.courseId);
  const groupChatIds = groupParticipants.map((participant) => participant.groupChat.id);
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
  const [directUnread, courseUnread, groupUnread] = await Promise.all([
    inboxDirectUnreadCounts(userId, connectionIds),
    inboxCourseUnreadCounts(userId, courseIds),
    inboxGroupUnreadCounts(userId, groupChatIds),
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
    ...groupParticipants.map((participant) => ({
      kind: "group" as const,
      sortAt: participant.groupChat.messages[0]?.createdAt ?? participant.groupChat.updatedAt,
      groupChat: participant.groupChat,
      inboxPinnedAt: participant.inboxPinnedAt,
      last: participant.groupChat.messages[0],
      unreadCount: groupUnread.get(participant.groupChat.id) ?? 0,
    })),
  ].sort((a, b) => {
    const aPinned = inboxMergedPinned(a, userId);
    const bPinned = inboxMergedPinned(b, userId);

    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }

    return b.sortAt.getTime() - a.sortAt.getTime();
  });

  let unreadTotal = 0;
  for (const id of connectionIds) unreadTotal += directUnread.get(id) ?? 0;
  for (const id of courseIds) unreadTotal += courseUnread.get(id) ?? 0;
  for (const id of groupChatIds) unreadTotal += groupUnread.get(id) ?? 0;

  return {
    merged,
    unreadTotal,
    plansNeedingYourAction,
    planOutcomesNeedingYourResponse,
  };
}
