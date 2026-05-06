import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Per-connection: messages from others after the viewer last opened the thread.
 * Excludes tombstoned rows.
 */
export async function inboxDirectUnreadCounts(
  userId: string,
  connectionIds: readonly string[],
): Promise<Map<string, number>> {
  if (connectionIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<Array<{ connectionId: string; cnt: bigint }>>(
    Prisma.sql`
      SELECT c."id" AS "connectionId", COUNT(m."id")::bigint AS cnt
      FROM "Connection" c
      JOIN "Message" m ON m."connectionId" = c."id"
      WHERE c."id" IN (${Prisma.join(connectionIds)})
        AND m."senderId" <> ${userId}
        AND m."deletedAt" IS NULL
        AND m."createdAt" > COALESCE(
          CASE
            WHEN c."userAId" = ${userId} THEN c."readByAAt"
            WHEN c."userBId" = ${userId} THEN c."readByBAt"
            ELSE NULL
          END,
          to_timestamp(0)
        )
      GROUP BY c."id"
    `,
  );

  return new Map(rows.map((r) => [r.connectionId, Number(r.cnt)]));
}

/** Same read-cursor semantics as direct chat, for course room timelines. */
export async function inboxCourseUnreadCounts(
  userId: string,
  courseIds: readonly string[],
): Promise<Map<string, number>> {
  if (courseIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<Array<{ courseId: string; cnt: bigint }>>(
    Prisma.sql`
      SELECT m."courseId", COUNT(m."id")::bigint AS cnt
      FROM "CourseRoomMessage" m
      JOIN "UserCourse" uc
        ON uc."courseId" = m."courseId"
       AND uc."userId" = ${userId}
      WHERE m."courseId" IN (${Prisma.join(courseIds)})
        AND m."senderId" <> ${userId}
        AND m."deletedAt" IS NULL
        AND m."createdAt" > COALESCE(uc."courseChatReadAt", to_timestamp(0))
      GROUP BY m."courseId"
    `,
  );

  return new Map(rows.map((r) => [r.courseId, Number(r.cnt)]));
}
