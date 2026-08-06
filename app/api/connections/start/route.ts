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
import { findSharedActiveCourse } from "@/lib/courses/shared-active-courses";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { startConversationSchema } from "@/lib/validators/invitation";
import { findOrCreateSelfNotesConnection } from "@/lib/queries/self-notes-connection";

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

    if (values.peerId === user.id) {
      const { connectionId, created } = await findOrCreateSelfNotesConnection(user.id);
      const message = await prisma.message.create({
        data: {
          connectionId,
          senderId: user.id,
          body,
        },
      });
      await prisma.connection.update({
        where: { id: connectionId },
        data: { updatedAt: message.createdAt },
      });
      return ok({ connectionId, created }, { status: created ? 201 : 200 });
    }

    const [peer, mutualBlock, peerModerated, sharedCourse, existingConnection] =
      await Promise.all([
        prisma.user.findUnique({
          where: { id: values.peerId },
          select: { id: true, onboardingComplete: true, school: true },
        }),
        prisma.block.findFirst({
          where: {
            OR: [
              { blockerId: user.id, blockedId: values.peerId },
              { blockerId: values.peerId, blockedId: user.id },
            ],
          },
          select: { id: true },
        }),
        prisma.moderationBlock.findFirst({
          where: {
            userId: { in: [user.id, values.peerId] },
            isActive: true,
          },
          select: { id: true },
        }),
        findSharedActiveCourse(prisma, user.id, values.peerId, values.courseId),
        prisma.connection.findFirst({
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
      return error("That person is not available.", 404);
    }

    const viewerSchool = normalizeSchoolCode(user.school) ?? DEFAULT_SCHOOL;
    const peerSchool = normalizeSchoolCode(peer.school) ?? DEFAULT_SCHOOL;
    if (viewerSchool !== peerSchool) {
      return error("Cross-school messages are not available yet.", 403);
    }

    if (mutualBlock || peerModerated) {
      return error("This user is unavailable for contact.", 403);
    }

    // Reusing an existing ACTIVE connection: just insert the message and bail.
    // This keeps the "Message" button idempotent from every surface.
    if (existingConnection && existingConnection.status === ConnectionStatus.ACTIVE) {
      try {
        await prisma.$transaction(async (tx) => {
          const { message } = await createDirectMessageRecord(tx, {
            connectionId: existingConnection.id,
            senderId: user.id,
            input: { type: "TEXT", body },
          });
          await tx.connection.update({
            where: { id: existingConnection.id },
            data: { updatedAt: message.createdAt },
          });
        });
      } catch (cause) {
        if (cause instanceof PeerReplyRequiredError) {
          return error(cause.message, 403, "PEER_REPLY_REQUIRED");
        }
        throw cause;
      }
      return ok(
        { connectionId: existingConnection.id, created: false },
        { status: 200 },
      );
    }

    // A non-ACTIVE (ENDED/BLOCKED) prior connection should not silently
    // resurrect. Admin-unblocks can flip BLOCKED back to ACTIVE if ever needed.
    if (existingConnection) {
      return error("This conversation is no longer available.", 409);
    }

    if (values.courseId && !sharedCourse) {
      return error("That course context is no longer valid.", 403);
    }

    // Rate limit: count connections *created* by this user in the window,
    // regardless of role (userA or userB) — but since rows only get written
    // once per thread, filtering on connection.createdAt is the right metric.
    const since = subMinutes(new Date(), NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES);
    const recentCount = await prisma.connection.count({
      where: {
        createdAt: { gte: since },
        OR: [{ userAId: user.id }, { userBId: user.id }],
        // Only threads where this user posted the first message, which in
        // practice is the first Message.senderId. Using the simpler proxy of
        // "Connection rows touched by me" slightly over-counts if the peer
        // started a thread against me, but that's fine — if anything it makes
        // the limit stricter for one side, not looser.
      },
    });
    if (recentCount >= NEW_THREAD_RATE_LIMIT_COUNT) {
      return error(
        "You've started too many new chats recently. Try again in a bit.",
        429,
      );
    }

    const originCourseId = sharedCourse?.id ?? null;

    const { connectionId } = await prisma.$transaction(async (tx) => {
      const connection = await tx.connection.create({
        data: {
          userAId: user.id,
          userBId: values.peerId,
          status: ConnectionStatus.ACTIVE,
          originCourseId,
        },
      });
      await tx.message.create({
        data: {
          connectionId: connection.id,
          senderId: user.id,
          body,
        },
      });
      return { connectionId: connection.id };
    });

    return ok({ connectionId, created: true }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to start conversation.");
  }
}
