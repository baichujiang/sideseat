import {
  ClassmatePostClosureReason,
  ClassmatePostStatus,
  InvitationStatus,
  type Prisma,
} from "@prisma/client";

import { getSchoolMatchValues, normalizeSchoolCode } from "@/lib/constants/schools";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";

function normalizedSchoolIdentity(school: string | null | undefined) {
  return normalizeSchoolCode(school) ?? school?.trim().toLocaleUpperCase() ?? "";
}

export function schoolIdentityChanged(
  previousSchool: string | null | undefined,
  nextSchool: string | null | undefined,
) {
  return normalizedSchoolIdentity(previousSchool) !== normalizedSchoolIdentity(nextSchool);
}

export async function archivePreviousSchoolSocialState(
  tx: Prisma.TransactionClient,
  options: {
    userId: string;
    previousSchool: string | null;
    nextSchool: string;
    now?: Date;
  },
) {
  if (!schoolIdentityChanged(options.previousSchool, options.nextSchool)) {
    return {
      archivedCourseCount: 0,
      removedCalendarEntryCount: 0,
      closedPostCount: 0,
      expiredInvitationCount: 0,
    };
  }

  const now = options.now ?? new Date();
  const inactiveAt = new Date(now.getTime() - 1);
  const nextSchoolValues = getSchoolMatchValues(options.nextSchool);
  const oldMemberships = await tx.userCourse.findMany({
    where: {
      userId: options.userId,
      ...activeCourseMembershipWhere(now),
      course: { school: { notIn: nextSchoolValues } },
    },
    select: { id: true, courseId: true },
  });
  const membershipIds = oldMemberships.map((membership) => membership.id);
  const courseIds = [...new Set(oldMemberships.map((membership) => membership.courseId))];

  const archivedCourses = membershipIds.length
    ? await tx.userCourse.updateMany({
        where: { id: { in: membershipIds } },
        data: { activeUntil: inactiveAt },
      })
    : { count: 0 };

  const removedCalendarEntries = courseIds.length
    ? await tx.calendarEntry.deleteMany({
        where: {
          userId: options.userId,
          OR: courseIds.map((courseId) => ({
            courseScheduleMirrorKey: { startsWith: `${courseId}_` },
          })),
        },
      })
    : { count: 0 };

  const closedPosts = await tx.classmatePost.updateMany({
    where: {
      userId: options.userId,
      status: ClassmatePostStatus.ACTIVE,
      OR: [
        { visibility: "SCHOOL_ONLY" },
        {
          courses: {
            some: { course: { school: { notIn: nextSchoolValues } } },
          },
        },
      ],
    },
    data: {
      status: ClassmatePostStatus.CLOSED,
      closureReason: ClassmatePostClosureReason.SCHOOL_CHANGED,
      closedAt: now,
    },
  });

  const expiredInvitations = await tx.invitation.updateMany({
    where: {
      status: InvitationStatus.PENDING,
      OR: [{ senderId: options.userId }, { receiverId: options.userId }],
      course: { school: { notIn: nextSchoolValues } },
    },
    data: { status: InvitationStatus.EXPIRED },
  });

  return {
    archivedCourseCount: archivedCourses.count,
    removedCalendarEntryCount: removedCalendarEntries.count,
    closedPostCount: closedPosts.count,
    expiredInvitationCount: expiredInvitations.count,
  };
}
