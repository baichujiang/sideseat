import { ConnectionStatus } from "@prisma/client";
import { subMinutes } from "date-fns";

import {
  NEW_THREAD_RATE_LIMIT_COUNT,
  NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES,
} from "@/lib/constants/app";
import { requireOnboardedUser } from "@/lib/auth/guards";
import {
  createDirectMessageRecord,
  PeerReplyRequiredError,
} from "@/lib/chat/direct-message-service";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import {
  withCanonicalConnectionScope,
  withSelfNotesConnectionScope,
} from "@/lib/connections/canonical-connection";
import { findSharedActiveCourse } from "@/lib/courses/shared-active-courses";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { startConversationSchema } from "@/lib/validators/invitation";

class StartConversationError extends Error {
  constructor(
    readonly code:
      | "PEER_UNAVAILABLE"
      | "CROSS_SCHOOL"
      | "CONTENT_RESTRICTED"
      | "CONVERSATION_ENDED"
      | "COURSE_CONTEXT_INVALID"
      | "RATE_LIMITED",
  ) {
    super(code);
    this.name = "StartConversationError";
  }
}

/**
 * First-message flow: creates a 1:1 conversation (or reuses an existing ACTIVE
 * one) and posts the first message, atomically.
 *
 * Access rule (current):
 *   - both users must be onboarded
 *   - same-school only
 *   - no mutual Block / moderation block
 *
 * Shared courses are no longer required globally. If the caller passes a
 * `courseId`, we still validate that both users are enrolled in that course
 * before using it as `originCourseId`.
 *
 * Abuse control:
 *   - ModerationBlock on either side → blocked
 *   - Mutual Block (either direction) → blocked
 *   - Rate limit: NEW_THREAD_RATE_LIMIT_COUNT new connections per window.
 *   - Unreplied send limit on reuse of an ACTIVE thread (same as /messages).
 *
 * Returns the resulting `connectionId` and a `created` flag so the client can
 * decide whether to navigate straight to the thread.
 */
export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const values = await parseJson(request, startConversationSchema);

    const body = values.body.trim();
    if (body.length === 0) {
      return error("Message cannot be empty.");
    }

    const result = await prisma.$transaction(async (tx) => {
      if (values.peerId === user.id) {
        return withSelfNotesConnectionScope(tx, user.id, async (scope) => {
          if (scope.existing && scope.existing.status !== ConnectionStatus.ACTIVE) {
            throw new StartConversationError("CONVERSATION_ENDED");
          }
          let created = false;
          let connection = scope.existing;
          if (!connection) {
            const result = await scope.createActive();
            connection = result;
            created = result.created;
          }
          const message = await tx.message.create({
            data: { connectionId: connection.id, senderId: user.id, body },
          });
          await tx.connection.update({
            where: { id: connection.id },
            data: { updatedAt: message.createdAt },
          });
          return { connectionId: connection.id, created };
        });
      }

      return withCanonicalConnectionScope(
        tx,
        user.id,
        values.peerId,
        async (scope) => {
          // Authentication-dependent user state, safety policy, course access,
          // rate limits, Connection creation and the first Message all share
          // the same pair-locked transaction.
          const [actor, peer, mutualBlock, peerModerated, sharedCourse] =
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
            ]);

          if (!actor?.onboardingComplete || !peer?.onboardingComplete) {
            throw new StartConversationError("PEER_UNAVAILABLE");
          }
          const viewerSchool = normalizeSchoolCode(actor.school) ?? DEFAULT_SCHOOL;
          const peerSchool = normalizeSchoolCode(peer.school) ?? DEFAULT_SCHOOL;
          if (viewerSchool !== peerSchool) {
            throw new StartConversationError("CROSS_SCHOOL");
          }
          if (mutualBlock || peerModerated) {
            throw new StartConversationError("CONTENT_RESTRICTED");
          }
          if (values.courseId && !sharedCourse) {
            throw new StartConversationError("COURSE_CONTEXT_INVALID");
          }
          if (scope.existing && scope.existing.status !== ConnectionStatus.ACTIVE) {
            throw new StartConversationError("CONVERSATION_ENDED");
          }

          let created = false;
          let connection = scope.existing;
          if (!connection) {
            const since = subMinutes(
              new Date(),
              NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES,
            );
            const recentCount = await tx.connection.count({
              where: {
                createdAt: { gte: since },
                OR: [{ userAId: user.id }, { userBId: user.id }],
              },
            });
            if (recentCount >= NEW_THREAD_RATE_LIMIT_COUNT) {
              throw new StartConversationError("RATE_LIMITED");
            }
            const createdConnection = await scope.createActive({
              originCourseId: sharedCourse?.id ?? null,
            });
            connection = createdConnection;
            created = createdConnection.created;
          }

          const { message } = await createDirectMessageRecord(tx, {
            connectionId: connection.id,
            senderId: user.id,
            input: { type: "TEXT", body },
          });
          await tx.connection.update({
            where: { id: connection.id },
            data: { updatedAt: message.createdAt },
          });
          return { connectionId: connection.id, created };
        },
      );
    });

    return ok(result, { status: result.created ? 201 : 200 });
  } catch (cause) {
    if (cause instanceof PeerReplyRequiredError) {
      return error(cause.message, 403, "PEER_REPLY_REQUIRED");
    }
    if (cause instanceof StartConversationError) {
      switch (cause.code) {
        case "PEER_UNAVAILABLE":
          return error("That person is not available.", 404);
        case "CROSS_SCHOOL":
          return error("Cross-school messages are not available yet.", 403);
        case "CONTENT_RESTRICTED":
          return error("This user is unavailable for contact.", 403);
        case "CONVERSATION_ENDED":
          return error("This conversation is no longer available.", 409);
        case "COURSE_CONTEXT_INVALID":
          return error("That course context is no longer valid.", 403);
        case "RATE_LIMITED":
          return error(
            "You've started too many new chats recently. Try again in a bit.",
            429,
          );
      }
    }
    console.error(cause);
    return error("Unable to start conversation.");
  }
}
