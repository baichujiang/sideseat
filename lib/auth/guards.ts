import "server-only";

import { notFound, redirect } from "next/navigation";
import type { User } from "@prisma/client";
import { ConnectionStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { requireUser } from "@/lib/auth/session";
import { adminEmails } from "@/lib/constants/app";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";

// Throttle window for lastActiveAt writes. Every page load calls
// requireOnboardedUser(), but bumping a timestamp on every request is wasteful
// and would also make Discover's tie-breaker too noisy. Once every 5 min is
// plenty for "recently active" semantics.
const ACTIVE_AT_THROTTLE_MS = 5 * 60 * 1000;

export async function requireOnboardedUser() {
  const user = await requireUser();

  if (!user.onboardingComplete) {
    redirect("/onboarding");
  }

  const now = Date.now();
  const last = user.lastActiveAt ? user.lastActiveAt.getTime() : 0;
  if (now - last > ACTIVE_AT_THROTTLE_MS) {
    // Fire-and-forget: a missed write is harmless, we don't want to block the
    // request on it. The updated value is mirrored back onto `user` so callers
    // in the same request see the fresh timestamp.
    const nowDate = new Date(now);
    user.lastActiveAt = nowDate;
    prisma.user
      .update({ where: { id: user.id }, data: { lastActiveAt: nowDate } })
      .catch((err) => {
        console.error("Failed to bump lastActiveAt", err);
      });
  }

  return user;
}

export async function requireConnection(connectionId: string) {
  const user = await requireOnboardedUser();
  const connection = await prisma.connection.findFirst({
    where: {
      id: connectionId,
      status: ConnectionStatus.ACTIVE,
      userA: {
        moderationBlocks: {
          none: {
            isActive: true,
          },
        },
      },
      userB: {
        moderationBlocks: {
          none: {
            isActive: true,
          },
        },
      },
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
    include: {
      userA: true,
      userB: true,
      invitation: {
        include: {
          course: true,
        },
      },
      messages: {
        include: {
          sender: true,
          availabilityShare: {
            include: {
              owner: true,
            },
          },
          planRequest: {
            include: {
              availabilityShare: true,
              proposer: true,
              receiver: true,
            },
          },
          replyTo: {
            include: { sender: true },
          },
        },
        orderBy: {
          createdAt: "asc",
        },
      },
    },
  });

  if (!connection) {
    notFound();
  }

  return { connection, user };
}

/**
 * Load another user's public profile only when there is an active connection
 * between the current user and that peer (same moderation rules as chat).
 */
export async function requirePeerProfileAccess(peerUserId: string) {
  const user = await requireOnboardedUser();

  if (peerUserId === user.id) {
    notFound();
  }

  const connection = await prisma.connection.findFirst({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [
        { userAId: user.id, userBId: peerUserId },
        { userAId: peerUserId, userBId: user.id },
      ],
      userA: {
        moderationBlocks: {
          none: {
            isActive: true,
          },
        },
      },
      userB: {
        moderationBlocks: {
          none: {
            isActive: true,
          },
        },
      },
    },
    include: {
      invitation: {
        include: {
          course: true,
        },
      },
      contactExchangeRequests: {
        orderBy: {
          createdAt: "desc",
        },
      },
      friendLink: true,
      userA: true,
      userB: true,
    },
  });

  if (!connection) {
    notFound();
  }

  const peer = connection.userAId === peerUserId ? connection.userA : connection.userB;
  const courseName = connection.invitation?.course?.name ?? null;

  return {
    user,
    peer,
    courseName,
    connectionId: connection.id,
    contactExchangeRequests: connection.contactExchangeRequests,
    friendLink: connection.friendLink,
  };
}

/**
 * Profile access for someone you reach from a course chat: allowed if (a) you
 * already have an active connection (existing flow), OR (b) you both have at
 * least one course in `UserCourse` in common. Uses the same moderation /
 * mutual-block filters as `requirePeerProfileAccess`.
 */
export async function requireClassmateOrConnectionProfileAccess(peerUserId: string) {
  const user = await requireOnboardedUser();

  if (peerUserId === user.id) {
    notFound();
  }

  const moderationBlock = await prisma.moderationBlock.findFirst({
    where: { userId: { in: [user.id, peerUserId] }, isActive: true },
    select: { id: true },
  });
  if (moderationBlock) {
    notFound();
  }

  const mutualBlock = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: user.id, blockedId: peerUserId },
        { blockerId: peerUserId, blockedId: user.id },
      ],
    },
    select: { id: true },
  });
  if (mutualBlock) {
    notFound();
  }

  const connection = await prisma.connection.findFirst({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [
        { userAId: user.id, userBId: peerUserId },
        { userAId: peerUserId, userBId: user.id },
      ],
    },
    include: {
      invitation: { include: { course: true } },
      contactExchangeRequests: { orderBy: { createdAt: "desc" } },
      friendLink: true,
      userA: true,
      userB: true,
    },
  });

  if (connection) {
    const peer = connection.userAId === peerUserId ? connection.userA : connection.userB;
    return {
      mode: "connection" as const,
      user,
      peer,
      courseName: connection.invitation?.course?.name ?? null,
      connectionId: connection.id,
      contactExchangeRequests: connection.contactExchangeRequests,
      friendLink: connection.friendLink,
      sharedCourses: [] as Array<{ id: string; name: string; code: string | null }>,
    };
  }

  // Fall back to the "classmate" mode: same course at least once.
  const sharedCourses = await prisma.course.findMany({
    where: {
      members: { some: { userId: user.id } },
      AND: { members: { some: { userId: peerUserId } } },
    },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  if (sharedCourses.length === 0) {
    notFound();
  }

  const peer = await prisma.user.findUnique({ where: { id: peerUserId } });
  if (!peer) {
    notFound();
  }

  return {
    mode: "classmate" as const,
    user,
    peer,
    courseName: null,
    connectionId: null,
    contactExchangeRequests: [] as Awaited<
      ReturnType<typeof prisma.contactExchangeRequest.findMany>
    >,
    friendLink: null,
    sharedCourses,
  };
}

/**
 * Public profile access for Discover/search/share links.
 *
 * Policy:
 *   - viewer and peer must be onboarded students in the same school
 *   - neither side may have blocked the other
 *   - neither side may have an active moderation block
 *
 * Returned mode:
 *   - "connection": already active 1:1 thread
 *   - "classmate" : no thread yet, but they share at least one enrolled course
 *   - "public"    : same school but no shared course
 */
export async function requirePublicProfileAccess(peerUserId: string) {
  const user = await requireOnboardedUser();

  if (peerUserId === user.id) {
    notFound();
  }

  const viewerSchool = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;

  const peerBase = await prisma.user.findUnique({
    where: { id: peerUserId },
    select: {
      id: true,
      username: true,
      nickname: true,
      avatarUrl: true,
      bio: true,
      major: true,
      semester: true,
      school: true,
      degreeLevel: true,
      verifiedStudent: true,
      studentVerificationStatus: true,
      languages: true,
      onboardingComplete: true,
      wechatHandle: true,
      whatsappHandle: true,
      telegramHandle: true,
      instagramHandle: true,
    },
  });
  if (!peerBase || !peerBase.onboardingComplete) {
    notFound();
  }

  const peerSchool = normalizeSchoolCode(peerBase.school) ?? DEFAULT_SCHOOL;
  if (peerSchool !== viewerSchool) {
    notFound();
  }

  const moderationBlock = await prisma.moderationBlock.findFirst({
    where: { userId: { in: [user.id, peerUserId] }, isActive: true },
    select: { id: true },
  });
  if (moderationBlock) {
    notFound();
  }

  const mutualBlock = await prisma.block.findFirst({
    where: {
      OR: [
        { blockerId: user.id, blockedId: peerUserId },
        { blockerId: peerUserId, blockedId: user.id },
      ],
    },
    select: { id: true },
  });
  if (mutualBlock) {
    notFound();
  }

  const [connection, sharedCourses, peerCourses] = await Promise.all([
    prisma.connection.findFirst({
      where: {
        status: ConnectionStatus.ACTIVE,
        OR: [
          { userAId: user.id, userBId: peerUserId },
          { userAId: peerUserId, userBId: user.id },
        ],
      },
      include: {
        invitation: { include: { course: true } },
        contactExchangeRequests: { orderBy: { createdAt: "desc" } },
        friendLink: true,
        userA: true,
        userB: true,
      },
    }),
    prisma.course.findMany({
      where: {
        members: { some: { userId: user.id } },
        AND: { members: { some: { userId: peerUserId } } },
      },
      select: { id: true, name: true, code: true },
      orderBy: { name: "asc" },
    }),
    prisma.userCourse.findMany({
      where: { userId: peerUserId },
      select: {
        courseId: true,
        course: {
          select: {
            id: true,
            name: true,
            code: true,
            semesterLabel: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const common = {
    user,
    peer: peerBase,
    sharedCourses,
    peerCourses: peerCourses.map((row) => row.course),
  };

  if (connection) {
    const peer = connection.userAId === peerUserId ? connection.userA : connection.userB;
    return {
      mode: "connection" as const,
      ...common,
      peer,
      courseName: connection.invitation?.course?.name ?? null,
      connectionId: connection.id,
      contactExchangeRequests: connection.contactExchangeRequests,
      friendLink: connection.friendLink,
    };
  }

  if (sharedCourses.length > 0) {
    return {
      mode: "classmate" as const,
      ...common,
      courseName: null,
      connectionId: null,
      contactExchangeRequests: [] as Awaited<
        ReturnType<typeof prisma.contactExchangeRequest.findMany>
      >,
      friendLink: null,
    };
  }

  return {
    mode: "public" as const,
    ...common,
    courseName: null,
    connectionId: null,
    contactExchangeRequests: [] as Awaited<
      ReturnType<typeof prisma.contactExchangeRequest.findMany>
    >,
    friendLink: null,
  };
}

/** Enrolled member of a course — for public course chat read/write. */
export async function requireCourseChatMember(courseId: string) {
  const user = await requireOnboardedUser();

  const membership = await prisma.userCourse.findFirst({
    where: { userId: user.id, courseId },
    include: {
      course: true,
    },
  });

  if (!membership) {
    notFound();
  }

  return { user, course: membership.course, userCourse: membership };
}

/** Admin actions require a verified admin email on the account (guest/username-only accounts cannot be admins). */
export async function requireAdminUser(): Promise<User & { email: string }> {
  const user = await requireOnboardedUser();
  const email = user.email?.toLowerCase();

  if (!email || !adminEmails.includes(email)) {
    redirect("/home");
  }

  return { ...user, email };
}
