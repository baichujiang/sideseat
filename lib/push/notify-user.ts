import "server-only";

import { after } from "next/server";
import { WebPushError } from "web-push";

import { isRetiredSystemUser } from "@/lib/auth/retired-system-users";
import { prisma } from "@/lib/db/prisma";
import { activeCourseMembershipWhere } from "@/lib/courses/active-membership";
import {
  type ApnsEnvironment,
  isApnsConfigured,
  normalizeApnsEnvironment,
} from "@/lib/push/apns-env";
import {
  type PushNotificationKind,
  type UserPushPayload,
} from "@/lib/push/apns-payload";
import { sendApnsNotification } from "@/lib/push/apns-send";
import { isWebPushConfigured } from "@/lib/push/vapid-env";
import { sendWebPushNotification } from "@/lib/push/web-push-server";
import { getInboxUnreadTotal } from "@/lib/queries/inbox-merge";

function truncate(s: string, max: number) {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function sendNativePushWithRetry(
  token: string,
  payload: UserPushPayload,
  environment: ApnsEnvironment,
) {
  let result = await sendApnsNotification(token, payload, environment);
  if (
    !result.ok &&
    !result.invalidateToken &&
    (result.status === 0 || result.status === 429 || result.status >= 500)
  ) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    result = await sendApnsNotification(token, payload, environment);
  }
  return result;
}

async function notifyNativeDevices(
  userId: string,
  payload: UserPushPayload,
): Promise<void> {
  if (!isApnsConfigured()) return;

  const devices = await prisma.nativePushDevice.findMany({
    where: { userId, platform: "ios" },
    select: { id: true, token: true, environment: true },
  });
  if (devices.length === 0) return;

  await Promise.all(
    devices.map(async (device) => {
      const environment = normalizeApnsEnvironment(device.environment);
      if (!isApnsConfigured(environment)) return;
      const result = await sendNativePushWithRetry(
        device.token,
        payload,
        environment,
      );
      if (!result.ok && result.invalidateToken) {
        await prisma.nativePushDevice
          .deleteMany({ where: { id: device.id } })
          .catch(() => {});
      } else if (!result.ok) {
        console.error(
          "APNs push failed",
          device.token.slice(0, 12),
          result.reason,
        );
      }
    }),
  );
}

async function notifyWebDevices(
  userId: string,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  if (!isWebPushConfigured()) return;

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  if (subs.length === 0) return;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await sendWebPushNotification(
          { endpoint: sub.endpoint, p256dh: sub.p256dh, auth: sub.auth },
          payload,
        );
      } catch (err: unknown) {
        if (
          err instanceof WebPushError &&
          (err.statusCode === 410 || err.statusCode === 404)
        ) {
          await prisma.pushSubscription
            .deleteMany({ where: { endpoint: sub.endpoint } })
            .catch(() => {});
        } else {
          console.error("Web push failed", sub.endpoint.slice(0, 48), err);
        }
      }
    }),
  );
}

/** Sends a notification only to browser subscriptions. */
export async function notifyUserWebPush(
  userId: string,
  payload: { title: string; body: string; url?: string },
): Promise<void> {
  await notifyWebDevices(userId, payload);
}

/**
 * Sends the same payload to every stored Web Push subscription and native APNs
 * device for the user. Removes subscriptions/tokens the push service reports as gone.
 */
export async function notifyUserPush(
  userId: string,
  payload: UserPushPayload,
): Promise<void> {
  await Promise.all([
    notifyWebDevices(userId, payload),
    notifyNativeDevices(userId, payload),
  ]);
}

export type DiscoverDiscussionNotificationParams = {
  recipientUserId: string;
  actorId: string;
  resource: "post" | "activity";
  resourceId: string;
  resourceTitle: string;
  bodyPreview: string;
  isReply: boolean;
};

export function scheduleDiscoverDiscussionNotification(
  params: DiscoverDiscussionNotificationParams,
): void {
  if (params.recipientUserId === params.actorId) return;
  after(async () => {
    await notifyDiscoverDiscussion(params).catch((cause) => {
      console.error("Discover discussion push failed", cause);
    });
  });
}

export async function notifyDiscoverDiscussion(
  params: DiscoverDiscussionNotificationParams,
): Promise<void> {
  const [actor, blocked] = await Promise.all([
    prisma.user.findUnique({
      where: { id: params.actorId },
      select: { nickname: true, username: true },
    }),
    prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: params.recipientUserId, blockedId: params.actorId },
          { blockerId: params.actorId, blockedId: params.recipientUserId },
        ],
      },
      select: { id: true },
    }),
  ]);
  if (!actor || blocked) return;

  const actorName = actor.nickname?.trim() || actor.username;
  const kind: Extract<
    PushNotificationKind,
    "discover_comment" | "discover_reply"
  > = params.isReply ? "discover_reply" : "discover_comment";
  const resourcePath = params.resource === "post" ? "posts" : "activities";
  const url = `/discover/${resourcePath}/${params.resourceId}`;

  await notifyUserPush(params.recipientUserId, {
    title: params.isReply
      ? `${actorName} replied to you`
      : `New comment on ${truncate(params.resourceTitle, 60)}`,
    body: truncate(params.bodyPreview, 140),
    url,
    threadId: `discover:${params.resource}:${params.resourceId}`,
    category: "DISCOVER_COMMENT",
    data: {
      kind,
      resource: params.resource,
      resourceId: params.resourceId,
    },
  });
}

export type DirectChatNotificationParams = {
  connectionId: string;
  senderId: string;
  bodyPreview: string;
  kind?: Extract<
    PushNotificationKind,
    | "direct_message"
    | "plan_invite"
    | "plan_counter"
    | "plan_accepted"
    | "plan_declined"
  >;
  planId?: string;
  planTitle?: string;
};

export function scheduleNewDirectChatMessageNotification(
  params: DirectChatNotificationParams,
): void {
  after(async () => {
    await notifyNewDirectChatMessage(params).catch((cause) => {
      console.error("Direct chat push failed", cause);
    });
  });
}

type DeliverableDirectNotificationConnection = Readonly<{
  userAId: string;
  userBId: string;
}>;

async function deliverableDirectNotificationConnection(
  params: Pick<DirectChatNotificationParams, "connectionId" | "senderId" | "planId">,
): Promise<DeliverableDirectNotificationConnection | null> {
  const connection = await prisma.connection.findFirst({
    where: {
      id: params.connectionId,
      status: "ACTIVE",
      userA: { moderationBlocks: { none: { isActive: true } } },
      userB: { moderationBlocks: { none: { isActive: true } } },
    },
    select: { userAId: true, userBId: true },
  });
  if (
    !connection ||
    connection.userAId === connection.userBId ||
    (params.senderId !== connection.userAId &&
      params.senderId !== connection.userBId)
  ) {
    return null;
  }

  const peerId =
    connection.userAId === params.senderId
      ? connection.userBId
      : connection.userAId;
  const [pairBlock, visiblePlan] = await Promise.all([
    prisma.block.findFirst({
      where: {
        OR: [
          { blockerId: params.senderId, blockedId: peerId },
          { blockerId: peerId, blockedId: params.senderId },
        ],
      },
      select: { id: true },
    }),
    params.planId
      ? prisma.planRequest.findFirst({
          where: {
            id: params.planId,
            connectionId: params.connectionId,
            OR: [
              { commitmentId: null },
              { commitment: { is: { safetyRestrictedAt: null } } },
            ],
          },
          select: { id: true },
        })
      : Promise.resolve({ id: "direct-message" }),
  ]);
  return pairBlock || !visiblePlan ? null : connection;
}

/** Participant message/Plan pushes never bypass a current pair safety barrier. */
export async function isDirectChatNotificationDeliverable(
  params: Pick<DirectChatNotificationParams, "connectionId" | "senderId" | "planId">,
): Promise<boolean> {
  return Boolean(await deliverableDirectNotificationConnection(params));
}

export async function notifyNewDirectChatMessage(
  params: DirectChatNotificationParams,
): Promise<void> {
  const connection = await deliverableDirectNotificationConnection(params);
  if (!connection) return;

  const peerId =
    connection.userAId === params.senderId
      ? connection.userBId
      : connection.userAId;

  const peer = await prisma.user.findUnique({
    where: { id: peerId },
    select: { username: true },
  });
  if (peer && isRetiredSystemUser(peer)) return;

  const sender = await prisma.user.findUnique({
    where: { id: params.senderId },
    select: { nickname: true, username: true },
  });
  const name = sender?.nickname?.trim() || sender?.username || "New message";
  const kind = params.kind ?? "direct_message";
  const planTitle = params.planTitle?.trim();
  const content = directNotificationContent({
    kind,
    senderName: name,
    bodyPreview: params.bodyPreview,
    planTitle,
  });
  const badge = await getInboxUnreadTotal(peerId).catch(() => undefined);

  // The callback may have been queued before a Block transaction committed.
  // Recheck immediately before delivery so stale message/Plan work is dropped.
  // The neutral PLAN_SAFETY_ENDED outbox uses a separate delivery path.
  if (!(await isDirectChatNotificationDeliverable(params))) return;

  await notifyUserPush(peerId, {
    ...content,
    url: `/connections/${params.connectionId}`,
    badge,
    threadId: `connection:${params.connectionId}`,
    category: kind === "direct_message" ? "DIRECT_MESSAGE" : "PLAN_UPDATE",
    data: {
      kind,
      connectionId: params.connectionId,
      ...(params.planId ? { planId: params.planId } : {}),
    },
  });
}

function directNotificationContent(options: {
  kind: Extract<
    PushNotificationKind,
    | "direct_message"
    | "plan_invite"
    | "plan_counter"
    | "plan_accepted"
    | "plan_declined"
  >;
  senderName: string;
  bodyPreview: string;
  planTitle?: string;
}): { title: string; body: string } {
  const planTitle = options.planTitle || "your plan";
  switch (options.kind) {
    case "plan_invite":
      return {
        title: "New plan invitation",
        body: truncate(`${options.senderName}: ${planTitle}`, 140),
      };
    case "plan_counter":
      return {
        title: "New plan time",
        body: truncate(`${options.senderName}: ${planTitle}`, 140),
      };
    case "plan_accepted":
      return {
        title: "Plan accepted",
        body: truncate(`${options.senderName} accepted ${planTitle}`, 140),
      };
    case "plan_declined":
      return {
        title: "Plan declined",
        body: truncate(`${options.senderName} declined ${planTitle}`, 140),
      };
    case "direct_message":
      return {
        title: options.senderName,
        body: truncate(options.bodyPreview, 140),
      };
  }
}

export type CourseRoomNotificationParams = {
  courseId: string;
  courseName: string;
  senderId: string;
  bodyPreview: string;
};

export function scheduleNewCourseRoomMessageNotification(
  params: CourseRoomNotificationParams,
): void {
  after(async () => {
    await notifyNewCourseRoomMessage(params).catch((cause) => {
      console.error("Course chat push failed", cause);
    });
  });
}

export async function notifyNewCourseRoomMessage(
  params: CourseRoomNotificationParams,
): Promise<void> {
  const members = await prisma.userCourse.findMany({
    where: {
      courseId: params.courseId,
      userId: { not: params.senderId },
      ...activeCourseMembershipWhere(),
    },
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
    members.map(async (m) => {
      const badge = await getInboxUnreadTotal(m.userId).catch(() => undefined);
      return notifyUserPush(m.userId, {
        title: params.courseName,
        body,
        url: `/courses/${params.courseId}/chat`,
        badge,
        threadId: `course:${params.courseId}`,
        category: "COURSE_MESSAGE",
        data: { kind: "course_message", courseId: params.courseId },
      });
    }),
  );
}

export type GroupChatNotificationParams = {
  groupChatId: string;
  title: string | null;
  senderId: string;
  bodyPreview: string;
};

export function scheduleNewGroupChatMessageNotification(
  params: GroupChatNotificationParams,
): void {
  after(async () => {
    await notifyNewGroupChatMessage(params).catch((cause) => {
      console.error("Group chat push failed", cause);
    });
  });
}

export async function notifyNewGroupChatMessage(
  params: GroupChatNotificationParams,
): Promise<void> {
  const members = await prisma.groupChatParticipant.findMany({
    where: {
      groupChatId: params.groupChatId,
      userId: { not: params.senderId },
    },
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
    members.map(async (member) => {
      const badge = await getInboxUnreadTotal(member.userId).catch(
        () => undefined,
      );
      return notifyUserPush(member.userId, {
        title: params.title?.trim() || "Group chat",
        body,
        url: `/groups/${params.groupChatId}`,
        badge,
        threadId: `group:${params.groupChatId}`,
        category: "GROUP_MESSAGE",
        data: { kind: "group_message", groupChatId: params.groupChatId },
      });
    }),
  );
}
