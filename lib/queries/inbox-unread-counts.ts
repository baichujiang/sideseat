import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";

/**
 * Per-connection: messages from others after your last outbound message in that
 * thread (or all inbound from others if you never sent). Excludes tombstoned rows.
 */
export async function inboxDirectUnreadCounts(
  userId: string,
  connectionIds: readonly string[],
): Promise<Map<string, number>> {
  if (connectionIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<Array<{ connectionId: string; cnt: bigint }>>(
    Prisma.sql`
      WITH last_outbound AS (
        SELECT "connectionId", MAX("createdAt") AS ts
        FROM "Message"
        WHERE "senderId" = ${userId}
          AND "deletedAt" IS NULL
          AND "connectionId" IN (${Prisma.join(connectionIds)})
        GROUP BY "connectionId"
      )
      SELECT m."connectionId", COUNT(*)::bigint AS cnt
      FROM "Message" m
      LEFT JOIN last_outbound lo ON lo."connectionId" = m."connectionId"
      WHERE m."connectionId" IN (${Prisma.join(connectionIds)})
        AND m."senderId" <> ${userId}
        AND m."deletedAt" IS NULL
        AND m."createdAt" > COALESCE(lo.ts, to_timestamp(0))
      GROUP BY m."connectionId"
    `,
  );

  return new Map(rows.map((r) => [r.connectionId, Number(r.cnt)]));
}

/** Same semantics as direct chat, for course room timelines. */
export async function inboxCourseUnreadCounts(
  userId: string,
  courseIds: readonly string[],
): Promise<Map<string, number>> {
  if (courseIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<Array<{ courseId: string; cnt: bigint }>>(
    Prisma.sql`
      WITH last_outbound AS (
        SELECT "courseId", MAX("createdAt") AS ts
        FROM "CourseRoomMessage"
        WHERE "senderId" = ${userId}
          AND "deletedAt" IS NULL
          AND "courseId" IN (${Prisma.join(courseIds)})
        GROUP BY "courseId"
      )
      SELECT m."courseId", COUNT(*)::bigint AS cnt
      FROM "CourseRoomMessage" m
      LEFT JOIN last_outbound lo ON lo."courseId" = m."courseId"
      WHERE m."courseId" IN (${Prisma.join(courseIds)})
        AND m."senderId" <> ${userId}
        AND m."deletedAt" IS NULL
        AND m."createdAt" > COALESCE(lo.ts, to_timestamp(0))
      GROUP BY m."courseId"
    `,
  );

  return new Map(rows.map((r) => [r.courseId, Number(r.cnt)]));
}
