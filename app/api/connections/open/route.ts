import { ConnectionStatus } from "@prisma/client";
import { subMinutes } from "date-fns";

import {
  NEW_THREAD_RATE_LIMIT_COUNT,
  NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES,
} from "@/lib/constants/app";
import { requireOnboardedUser } from "@/lib/auth/guards";
import { DEFAULT_SCHOOL, normalizeSchoolCode } from "@/lib/constants/schools";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { openConversationSchema } from "@/lib/validators/invitation";

/**
 * Open-chat flow for profile cards:
 *   - if an ACTIVE thread exists, return it
 *   - otherwise create an empty ACTIVE thread and return it
 *
 * Unlike `/api/connections/start`, this endpoint does not send a first message.
 * The user lands directly in the thread page and writes in the normal composer.
 */
export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const values = await parseJson(request, openConversationSchema);

    if (values.peerId === user.id) {
      return error("You cannot open a conversation with yourself.");
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
        prisma.userCourse.findFirst({
          where: {
            userId: user.id,
            course: { members: { some: { userId: values.peerId } } },
            ...(values.courseId ? { courseId: values.courseId } : {}),
          },
          select: { courseId: true },
        }),
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

    if (existingConnection && existingConnection.status === ConnectionStatus.ACTIVE) {
      return ok(
        { connectionId: existingConnection.id, created: false },
        { status: 200 },
      );
    }

    if (existingConnection) {
      return error("This conversation is no longer available.", 409);
    }

    if (values.courseId && !sharedCourse) {
      return error("That course context is no longer valid.", 403);
    }

    const since = subMinutes(new Date(), NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES);
    const recentCount = await prisma.connection.count({
      where: {
        createdAt: { gte: since },
        OR: [{ userAId: user.id }, { userBId: user.id }],
      },
    });
    if (recentCount >= NEW_THREAD_RATE_LIMIT_COUNT) {
      return error(
        "You've started too many new chats recently. Try again in a bit.",
        429,
      );
    }

    const originCourseId = sharedCourse?.courseId ?? null;

    const connection = await prisma.connection.create({
      data: {
        userAId: user.id,
        userBId: values.peerId,
        status: ConnectionStatus.ACTIVE,
        originCourseId,
      },
      select: { id: true },
    });

    return ok({ connectionId: connection.id, created: true }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to open conversation.");
  }
}
