import "server-only";

import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { prisma } from "@/lib/db/prisma";

export type InboxPreferenceState = {
  pinned: boolean;
  hidden: boolean;
};

export class InboxPreferenceError extends Error {
  constructor(readonly code: "NOT_FOUND") {
    super(code);
    this.name = "InboxPreferenceError";
  }
}

export async function toggleDirectConversationPin(options: {
  userId: string;
  connectionId: string;
}): Promise<InboxPreferenceState> {
  const connection = await prisma.connection.findFirst({
    where: {
      id: options.connectionId,
      OR: [{ userAId: options.userId }, { userBId: options.userId }],
    },
    select: {
      id: true,
      userAId: true,
      pinnedByAAt: true,
      pinnedByBAt: true,
    },
  });
  if (!connection) throw new InboxPreferenceError("NOT_FOUND");

  const isUserA = connection.userAId === options.userId;
  const currentlyPinned = isUserA
    ? Boolean(connection.pinnedByAAt)
    : Boolean(connection.pinnedByBAt);
  const nextPinnedAt = currentlyPinned ? null : new Date();

  await prisma.connection.update({
    where: { id: connection.id },
    data: isUserA
      ? { pinnedByAAt: nextPinnedAt }
      : { pinnedByBAt: nextPinnedAt },
  });

  return { pinned: !currentlyPinned, hidden: false };
}

export async function toggleCourseInboxPin(options: {
  userId: string;
  courseId: string;
}): Promise<InboxPreferenceState> {
  const membership = await prisma.userCourse.findFirst({
    where: {
      userId: options.userId,
      courseId: options.courseId,
      ...activeCourseMembershipWhere(),
    },
    select: { id: true, inboxPinnedAt: true, inboxHiddenAt: true },
  });
  if (!membership) throw new InboxPreferenceError("NOT_FOUND");

  const nextPinnedAt = membership.inboxPinnedAt ? null : new Date();
  await prisma.userCourse.update({
    where: { id: membership.id },
    data: { inboxPinnedAt: nextPinnedAt },
  });

  return {
    pinned: Boolean(nextPinnedAt),
    hidden: Boolean(membership.inboxHiddenAt),
  };
}

export async function setCourseInboxHidden(options: {
  userId: string;
  courseId: string;
  hidden: boolean;
}): Promise<InboxPreferenceState> {
  const membership = await prisma.userCourse.findFirst({
    where: {
      userId: options.userId,
      courseId: options.courseId,
      ...activeCourseMembershipWhere(),
    },
    select: { id: true, inboxPinnedAt: true, inboxHiddenAt: true },
  });
  if (!membership) throw new InboxPreferenceError("NOT_FOUND");

  const nextHiddenAt = options.hidden ? new Date() : null;
  await prisma.userCourse.update({
    where: { id: membership.id },
    data: { inboxHiddenAt: nextHiddenAt },
  });

  return {
    pinned: Boolean(membership.inboxPinnedAt),
    hidden: Boolean(nextHiddenAt),
  };
}

export async function toggleGroupInboxPin(options: {
  userId: string;
  groupChatId: string;
}): Promise<InboxPreferenceState> {
  const membership = await prisma.groupChatParticipant.findUnique({
    where: {
      groupChatId_userId: {
        groupChatId: options.groupChatId,
        userId: options.userId,
      },
    },
    select: { inboxPinnedAt: true, inboxHiddenAt: true },
  });
  if (!membership) throw new InboxPreferenceError("NOT_FOUND");

  const nextPinnedAt = membership.inboxPinnedAt ? null : new Date();
  await prisma.groupChatParticipant.update({
    where: {
      groupChatId_userId: {
        groupChatId: options.groupChatId,
        userId: options.userId,
      },
    },
    data: { inboxPinnedAt: nextPinnedAt },
  });

  return {
    pinned: Boolean(nextPinnedAt),
    hidden: Boolean(membership.inboxHiddenAt),
  };
}

export async function setGroupInboxHidden(options: {
  userId: string;
  groupChatId: string;
  hidden: boolean;
}): Promise<InboxPreferenceState> {
  const membership = await prisma.groupChatParticipant.findUnique({
    where: {
      groupChatId_userId: {
        groupChatId: options.groupChatId,
        userId: options.userId,
      },
    },
    select: { inboxPinnedAt: true, inboxHiddenAt: true },
  });
  if (!membership) throw new InboxPreferenceError("NOT_FOUND");

  const nextHiddenAt = options.hidden ? new Date() : null;
  await prisma.groupChatParticipant.update({
    where: {
      groupChatId_userId: {
        groupChatId: options.groupChatId,
        userId: options.userId,
      },
    },
    data: { inboxHiddenAt: nextHiddenAt },
  });

  return {
    pinned: Boolean(membership.inboxPinnedAt),
    hidden: Boolean(nextHiddenAt),
  };
}

export async function loadCourseInboxPreference(options: {
  userId: string;
  courseId: string;
}): Promise<InboxPreferenceState | null> {
  const membership = await prisma.userCourse.findFirst({
    where: {
      userId: options.userId,
      courseId: options.courseId,
      ...activeCourseMembershipWhere(),
    },
    select: { inboxPinnedAt: true, inboxHiddenAt: true },
  });
  if (!membership) return null;
  return {
    pinned: Boolean(membership.inboxPinnedAt),
    hidden: Boolean(membership.inboxHiddenAt),
  };
}

export async function loadGroupInboxPreference(options: {
  userId: string;
  groupChatId: string;
}): Promise<InboxPreferenceState | null> {
  const membership = await prisma.groupChatParticipant.findUnique({
    where: {
      groupChatId_userId: {
        groupChatId: options.groupChatId,
        userId: options.userId,
      },
    },
    select: { inboxPinnedAt: true, inboxHiddenAt: true },
  });
  if (!membership) return null;
  return {
    pinned: Boolean(membership.inboxPinnedAt),
    hidden: Boolean(membership.inboxHiddenAt),
  };
}
