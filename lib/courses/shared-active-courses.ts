import type { Prisma, PrismaClient } from "@prisma/client";

import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import { courseIdentityKey, sameCourseIdentityWhere } from "@/lib/courses/course-identity";

type Db = PrismaClient | Prisma.TransactionClient;

export type SharedActiveCourse = {
  id: string;
  name: string;
  code: string | null;
  school: string;
};

export async function loadSharedActiveCourses(
  db: Db,
  viewerId: string,
  peerId: string,
): Promise<SharedActiveCourse[]> {
  const rows = await db.userCourse.findMany({
    where: {
      userId: { in: [viewerId, peerId] },
      ...activeCourseMembershipWhere(),
    },
    select: {
      userId: true,
      course: { select: { id: true, name: true, code: true, school: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  const viewerByIdentity = new Map<string, SharedActiveCourse>();
  const peerIdentities = new Set<string>();
  for (const row of rows) {
    const key = courseIdentityKey(row.course);
    if (row.userId === viewerId && !viewerByIdentity.has(key)) {
      viewerByIdentity.set(key, row.course);
    }
    if (row.userId === peerId) peerIdentities.add(key);
  }

  return [...viewerByIdentity.entries()]
    .filter(([key]) => peerIdentities.has(key))
    .map(([, course]) => course)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function findSharedActiveCourse(
  db: Db,
  viewerId: string,
  peerId: string,
  contextCourseId?: string,
): Promise<SharedActiveCourse | null> {
  if (!contextCourseId) {
    return (await loadSharedActiveCourses(db, viewerId, peerId))[0] ?? null;
  }

  const context = await db.course.findUnique({
    where: { id: contextCourseId },
    select: { id: true, name: true, code: true, school: true },
  });
  if (!context) return null;

  const memberships = await db.userCourse.findMany({
    where: {
      userId: { in: [viewerId, peerId] },
      ...activeCourseMembershipWhere(),
      course: sameCourseIdentityWhere(context),
    },
    select: { userId: true },
    distinct: ["userId"],
  });
  const memberIds = new Set(memberships.map((row) => row.userId));
  return memberIds.has(viewerId) && memberIds.has(peerId) ? context : null;
}
