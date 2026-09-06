import "server-only";

import { ConnectionStatus, type Prisma, type User } from "@prisma/client";
import { subMinutes } from "date-fns";

import {
  NEW_THREAD_RATE_LIMIT_COUNT,
  NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES,
} from "@/lib/constants/app";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import {
  type ConnectionDatabase,
  withCanonicalConnectionScope,
  withConnectionTransaction,
  withSelfNotesConnectionScope,
} from "@/lib/connections/canonical-connection";
import { findSharedActiveCourse } from "@/lib/courses/shared-active-courses";
import { prisma } from "@/lib/db/prisma";
import { allowsLegacyDirectConversationForAction } from "@/lib/v2/action-coordination/policy-snapshot";

export type OpenConversationInput = {
  peerId: string;
  courseId?: string;
  postId?: string;
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
      | "POST_CONTEXT_INVALID"
      | "ACTION_COORDINATION_REQUIRED"
      | "RATE_LIMITED",
  ) {
    super(code);
  }
}

type DbClient = Prisma.TransactionClient | typeof prisma;

async function resolvePostMessageContext(
  db: DbClient,
  postId: string | undefined,
  peerId: string,
) {
  if (!postId) return null;
  const post = await db.classmatePost.findFirst({
    where: {
      id: postId,
      userId: peerId,
      status: "ACTIVE",
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      coordinationPolicy: true,
      policySchemaVersion: true,
      policyParametersSnapshot: true,
      experimentKeySnapshot: true,
      experimentVariantSnapshot: true,
      clientCapabilitySnapshot: true,
      policySnapshottedAt: true,
    },
  });
  if (!post) {
    throw new OpenConversationError("POST_CONTEXT_INVALID");
  }
  if (!allowsLegacyDirectConversationForAction(post)) {
    throw new OpenConversationError("ACTION_COORDINATION_REQUIRED");
  }
  return post;
}

async function recordPostMessageIntent(
  db: DbClient,
  postId: string | undefined,
  actorId: string,
) {
  if (!postId) return;
  await db.classmatePostInsight.upsert({
    where: {
      postId_actorId_kind: {
        postId,
        actorId,
        kind: "MESSAGE_INTENT",
      },
    },
    create: { postId, actorId, kind: "MESSAGE_INTENT" },
    update: {},
  });
}

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
  return withConnectionTransaction(db as ConnectionDatabase, async (tx) => {
    if (values.peerId === user.id) {
      if (values.postId) {
        throw new OpenConversationError("POST_CONTEXT_INVALID");
      }
      return withSelfNotesConnectionScope(tx, user.id, async (scope) => {
        if (scope.existing?.status === ConnectionStatus.ACTIVE) {
          return { connectionId: scope.existing.id, created: false };
        }
        if (scope.existing) {
          throw new OpenConversationError("CONVERSATION_ENDED");
        }
        const row = await scope.createActive();
        return { connectionId: row.id, created: row.created };
      });
    }

    return withCanonicalConnectionScope(
      tx,
      user.id,
      values.peerId,
      async (scope) => {
        // All mutable authorization and policy inputs are deliberately read
        // after the unordered-pair lock and inside this same transaction.
        const [actor, peer, mutualBlock, peerModerated, sharedCourse, postContext] =
          await Promise.all([
            tx.user.findUnique({
              where: { id: user.id },
              select: { id: true, onboardingComplete: true, school: true },
            }),
            tx.user.findUnique({
              where: { id: values.peerId },
              select: { id: true, onboardingComplete: true, school: true },
            }),
            tx.block.findFirst({
              where: {
                OR: [
                  { blockerId: user.id, blockedId: values.peerId },
                  { blockerId: values.peerId, blockedId: user.id },
                ],
              },
              select: { id: true },
            }),
            tx.moderationBlock.findFirst({
              where: {
                userId: { in: [user.id, values.peerId] },
                isActive: true,
              },
              select: { id: true },
            }),
            findSharedActiveCourse(
              tx,
              user.id,
              values.peerId,
              values.courseId,
            ),
            resolvePostMessageContext(tx, values.postId, values.peerId),
          ]);

        if (!actor?.onboardingComplete || !peer?.onboardingComplete) {
          throw new OpenConversationError("PEER_UNAVAILABLE");
        }

        const viewerSchool = normalizeSchoolCode(actor.school) ?? DEFAULT_SCHOOL;
        const peerSchool = normalizeSchoolCode(peer.school) ?? DEFAULT_SCHOOL;
        if (viewerSchool !== peerSchool) {
          throw new OpenConversationError("CROSS_SCHOOL");
        }
        if (mutualBlock || peerModerated) {
          throw new OpenConversationError("CONTENT_RESTRICTED");
        }
        if (values.courseId && !sharedCourse) {
          throw new OpenConversationError("COURSE_CONTEXT_INVALID");
        }

        if (scope.existing?.status === ConnectionStatus.ACTIVE) {
          await recordPostMessageIntent(tx, postContext?.id, user.id);
          return { connectionId: scope.existing.id, created: false };
        }
        if (scope.existing) {
          throw new OpenConversationError("CONVERSATION_ENDED");
        }

        const since = subMinutes(new Date(), NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES);
        const recentCount = await tx.connection.count({
          where: {
            createdAt: { gte: since },
            OR: [{ userAId: user.id }, { userBId: user.id }],
          },
        });
        if (recentCount >= NEW_THREAD_RATE_LIMIT_COUNT) {
          throw new OpenConversationError("RATE_LIMITED");
        }

        const connection = await scope.createActive({
          originCourseId: sharedCourse?.id ?? null,
        });
        await recordPostMessageIntent(tx, postContext?.id, user.id);
        return { connectionId: connection.id, created: connection.created };
      },
    );
  });
}
