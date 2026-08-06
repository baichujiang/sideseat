import "server-only";

import { ConnectionStatus, type Prisma, type User } from "@prisma/client";
import { subMinutes } from "date-fns";

import {
  NEW_THREAD_RATE_LIMIT_COUNT,
  NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES,
} from "@/lib/constants/app";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { findSharedActiveCourse } from "@/lib/courses/shared-active-courses";
import { prisma } from "@/lib/db/prisma";

export type OpenConversationInput = {
  peerId: string;
  courseId?: string;
};

export type OpenConversationResult = {
  connectionId: string;
  created: boolean;
};

export class OpenConversationError extends Error {
  constructor(
    public readonly code:
      | "PEER_UNAVAILABLE"
      | "CROSS_SCHOOL"
      | "CONTENT_RESTRICTED"
      | "CONVERSATION_ENDED"
      | "COURSE_CONTEXT_INVALID"
      | "RATE_LIMITED",
  ) {
    super(code);
  }
}

type DbClient = Prisma.TransactionClient | typeof prisma;

/**
 * Open-chat flow shared by Web and native clients:
 *   - if an ACTIVE thread exists, return it
 *   - otherwise create an empty ACTIVE thread and return it
 *
 * Unlike `/api/connections/start`, this does not send a first message.
 */
export async function openConversationForUser(
  user: Pick<User, "id" | "school">,
  values: OpenConversationInput,
  db: DbClient = prisma,
): Promise<OpenConversationResult> {
  if (values.peerId === user.id) {
    const existing = await db.connection.findFirst({
      where: {
        userAId: user.id,
        userBId: user.id,
        status: ConnectionStatus.ACTIVE,
      },
      select: { id: true },
    });
    if (existing) {
      return { connectionId: existing.id, created: false };
    }
    const row = await db.connection.create({
      data: {
        userAId: user.id,
        userBId: user.id,
        status: ConnectionStatus.ACTIVE,
      },
      select: { id: true },
    });
    return { connectionId: row.id, created: true };
  }

  const [peer, mutualBlock, peerModerated, sharedCourse, existingConnection] =
    await Promise.all([
      db.user.findUnique({
        where: { id: values.peerId },
        select: { id: true, onboardingComplete: true, school: true },
      }),
      db.block.findFirst({
        where: {
          OR: [
            { blockerId: user.id, blockedId: values.peerId },
            { blockerId: values.peerId, blockedId: user.id },
          ],
        },
        select: { id: true },
      }),
      db.moderationBlock.findFirst({
        where: {
          userId: { in: [user.id, values.peerId] },
          isActive: true,
        },
        select: { id: true },
      }),
      findSharedActiveCourse(db, user.id, values.peerId, values.courseId),
      db.connection.findFirst({
        where: {
          OR: [
            { userAId: user.id, userBId: values.peerId },
            { userAId: values.peerId, userBId: user.id },
          ],
        },
        select: { id: true, status: true },
      }),
    ]);

  if (!peer || !peer.onboardingComplete) {
    throw new OpenConversationError("PEER_UNAVAILABLE");
  }

  const viewerSchool = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
  const peerSchool = normalizeSchoolCode(peer.school) ?? DEFAULT_SCHOOL;
  if (viewerSchool !== peerSchool) {
    throw new OpenConversationError("CROSS_SCHOOL");
  }

  if (mutualBlock || peerModerated) {
    throw new OpenConversationError("CONTENT_RESTRICTED");
  }

  if (existingConnection && existingConnection.status === ConnectionStatus.ACTIVE) {
    return { connectionId: existingConnection.id, created: false };
  }

  if (existingConnection) {
    throw new OpenConversationError("CONVERSATION_ENDED");
  }

  if (values.courseId && !sharedCourse) {
    throw new OpenConversationError("COURSE_CONTEXT_INVALID");
  }

  const since = subMinutes(new Date(), NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES);
  const recentCount = await db.connection.count({
    where: {
      createdAt: { gte: since },
      OR: [{ userAId: user.id }, { userBId: user.id }],
    },
  });
  if (recentCount >= NEW_THREAD_RATE_LIMIT_COUNT) {
    throw new OpenConversationError("RATE_LIMITED");
  }

  const connection = await db.connection.create({
    data: {
      userAId: user.id,
      userBId: values.peerId,
      status: ConnectionStatus.ACTIVE,
      originCourseId: sharedCourse?.id ?? null,
    },
    select: { id: true },
  });

  return { connectionId: connection.id, created: true };
}
