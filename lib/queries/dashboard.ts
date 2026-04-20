import "server-only";

import { ConnectionStatus, InvitationStatus } from "@prisma/client";

import { getSchoolMatchValues } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";

export async function getDashboardData(userId: string) {
  const profile = await prisma.user.findUnique({
    where: { id: userId },
  });

  if (!profile) {
    return {
      profile: null,
      userCourses: [],
      receivedInvitations: [],
      sentInvitations: [],
      connections: [],
      discoverPeople: [],
    };
  }

  const schoolValues = getSchoolMatchValues(profile.school);

  const [userCourses, receivedInvitations, sentInvitations, connections, discoverPeople] =
    await Promise.all([
      prisma.userCourse.findMany({
        where: {
          userId,
          course: {
            school: schoolValues.length ? { in: schoolValues } : undefined,
          },
        },
        include: { course: true },
        orderBy: { createdAt: "desc" },
      }),
      prisma.invitation.findMany({
        where: { receiverId: userId, status: InvitationStatus.PENDING },
        include: { sender: true, course: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.invitation.findMany({
        where: { senderId: userId, status: InvitationStatus.PENDING },
        include: { receiver: true, course: true },
        orderBy: { createdAt: "desc" },
        take: 5,
      }),
      prisma.connection.findMany({
        where: {
          status: ConnectionStatus.ACTIVE,
          OR: [{ userAId: userId }, { userBId: userId }],
        },
        include: { userA: true, userB: true, invitation: { include: { course: true } } },
        orderBy: { updatedAt: "desc" },
        take: 6,
      }),
      prisma.user.findMany({
        where: {
          id: { not: userId },
          school: schoolValues.length ? { in: schoolValues } : undefined,
          moderationBlocks: {
            none: {
              isActive: true,
            },
          },
          blocksReceived: { none: { blockerId: userId } },
          OR: [
            {
              courses: {
                some: {
                  course: {
                    members: {
                      some: { userId },
                    },
                  },
                },
              },
            },
          ],
        },
        take: 6,
        include: {
          courses: {
            include: {
              course: true,
            },
          },
        },
      }),
    ]);

  return {
    profile,
    userCourses,
    receivedInvitations,
    sentInvitations,
    connections,
    discoverPeople,
  };
}
