import "server-only";

import { Prisma } from "@prisma/client";

import { getSchoolMatchValues } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";

export async function getDiscoverPeople(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      courses: {
        include: { course: true },
      },
    },
  });

  if (!user) {
    return [];
  }

  const courseIds = user.courses.map((membership) => membership.courseId);
  const schoolValues = getSchoolMatchValues(user.school);
  const orConditions: Prisma.UserWhereInput[] = [];

  if (courseIds.length) {
    orConditions.push({
      courses: { some: { courseId: { in: courseIds } } },
    });
  }

  if (user.major) {
    orConditions.push({ major: user.major });
  }

  if (user.semester) {
    orConditions.push({ semester: user.semester });
  }

  if (!orConditions.length) {
    return [];
  }

  const people = await prisma.user.findMany({
    where: {
      id: { not: userId },
      school: schoolValues.length ? { in: schoolValues } : undefined,
      moderationBlocks: {
        none: {
          isActive: true,
        },
      },
      blocksReceived: { none: { blockerId: userId } },
      blocksInitiated: { none: { blockedId: userId } },
      OR: orConditions,
    },
    include: {
      courses: {
        include: { course: true },
      },
    },
    take: 24,
  });

  return people.map((person) => {
    const sharedCourses = person.courses.filter((course) => courseIds.includes(course.courseId));
    const reasons = [
      ...sharedCourses.slice(0, 2).map((course) => ({
        label: `You both joined ${course.course.name}`,
      })),
      ...(user.major && person.major === user.major
        ? [{ label: `You are both in ${user.major}` }]
        : []),
      ...(user.semester && person.semester === user.semester
        ? [{ label: `You are both in ${user.semester} semester` }]
        : []),
    ];

    return {
      person,
      reasons,
      sharedCourseId: sharedCourses[0]?.courseId,
    };
  });
}
