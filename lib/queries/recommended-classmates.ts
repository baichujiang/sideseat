import "server-only";

import { ConnectionStatus } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import { getDiscoverPeople } from "@/lib/queries/discovery";

export type RecommendedClassmateRow = {
  userId: string;
  nickname: string;
  avatarUrl: string | null;
  school: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus:
    | "UNVERIFIED"
    | "EMAIL_PENDING"
    | "VERIFIED"
    | "MANUAL_REVIEW_REQUIRED"
    | "REJECTED";
};

/**
 * Classmates who share at least one of your courses, excluding people you already
 * chat with (active connections). Used on Courses and Inbox — not Discover feed.
 */
export async function getRecommendedClassmatesForViewer(
  userId: string,
  limit = 12,
): Promise<RecommendedClassmateRow[]> {
  const hits = await getDiscoverPeople(userId);
  if (hits.length === 0) return [];

  const otherIds = hits.map((h) => h.userId);
  const activeConnections = await prisma.connection.findMany({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [
        { userAId: userId, userBId: { in: otherIds } },
        { userAId: { in: otherIds }, userBId: userId },
      ],
    },
    select: { userAId: true, userBId: true },
  });
  const connectedUserIds = new Set<string>(
    activeConnections.map((c) => (c.userAId === userId ? c.userBId : c.userAId)),
  );

  return hits
    .filter((h) => !connectedUserIds.has(h.userId))
    .slice(0, limit)
    .map((h) => ({
      userId: h.userId,
      nickname: h.nickname,
      avatarUrl: h.avatarUrl,
      school: h.school,
      verifiedStudent: h.verifiedStudent,
      studentVerificationStatus: h.studentVerificationStatus,
    }));
}
