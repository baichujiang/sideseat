import "server-only";

import { WebPushError } from "web-push";

import { prisma } from "@/lib/db/prisma";
import { isWebPushConfigured } from "@/lib/push/vapid-env";
import { sendWebPushNotification } from "@/lib/push/web-push-server";

function truncate(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Sends the same payload to every stored subscription for the user.
 * Removes subscriptions that the push service reports as gone (410/404).
 */
export async function notifyUserPush(
  userId: string,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  if (!isWebPushConfigured()) return;

  const subs = await prisma.pushSubscription.findMany({
    where: { userId },
  });
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await sendWebPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
        );
      } catch (err: unknown) {
        if (err instanceof WebPushError && (err.statusCode === 410 || err.statusCode === 404)) {
          await prisma.pushSubscription.deleteMany({ where: { endpoint: sub.endpoint } }).catch(() => {});
        } else {
          console.error("Web push failed", sub.endpoint.slice(0, 48), err);
        }
      }
    }),
  );
}

export async function notifyNewDirectChatMessage(params: {
  connectionId: string;
  senderId: string;
  bodyPreview: string;
}): Promise<void> {
  const connection = await prisma.connection.findUnique({
    where: { id: params.connectionId },
    select: { userAId: true, userBId: true },
  });
  if (!connection) return;
  if (connection.userAId === connection.userBId) return;

  const peerId =
    connection.userAId === params.senderId ? connection.userBId : connection.userAId;

  const sender = await prisma.user.findUnique({
    where: { id: params.senderId },
    select: { nickname: true, username: true },
  });
  const name = sender?.nickname?.trim() || sender?.username || "New message";

  await notifyUserPush(peerId, {
    title: name,
    body: truncate(params.bodyPreview, 140),
    url: `/connections/${params.connectionId}`,
  });
}

export async function notifyNewCourseRoomMessage(params: {
  courseId: string;
  courseName: string;
  senderId: string;
  bodyPreview: string;
}): Promise<void> {
  const members = await prisma.userCourse.findMany({
    where: { courseId: params.courseId, userId: { not: params.senderId } },
    select: { userId: true },
  });
  if (members.length === 0) return;

  const sender = await prisma.user.findUnique({
    where: { id: params.senderId },
    select: { nickname: true, username: true },
  });
  const name = sender?.nickname?.trim() || sender?.username || "Someone";
  const body = `${name}: ${truncate(params.bodyPreview, 100)}`;

  await Promise.all(
    members.map((m) =>
      notifyUserPush(m.userId, {
        title: params.courseName,
        body,
        url: `/courses/${params.courseId}/chat`,
      }),
    ),
  );
}

export async function notifyNewGroupChatMessage(params: {
  groupChatId: string;
  title: string | null;
  senderId: string;
  bodyPreview: string;
}): Promise<void> {
  const members = await prisma.groupChatParticipant.findMany({
    where: { groupChatId: params.groupChatId, userId: { not: params.senderId } },
    select: { userId: true },
  });
  if (members.length === 0) return;

  const sender = await prisma.user.findUnique({
    where: { id: params.senderId },
    select: { nickname: true, username: true },
  });
  const senderName = sender?.nickname?.trim() || sender?.username || "Someone";
  const body = `${senderName}: ${truncate(params.bodyPreview, 100)}`;

  await Promise.all(
    members.map((member) =>
      notifyUserPush(member.userId, {
        title: params.title?.trim() || "Group chat",
        body,
        url: `/groups/${params.groupChatId}`,
      }),
    ),
  );
}
