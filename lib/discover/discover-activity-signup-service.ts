import "server-only";

import {
  DiscoverActivitySignupStatus,
  type Prisma,
  type User,
} from "@prisma/client";

import {
  canCancelSignup,
  canSignup,
  nextStatusAfterCancel,
  nextStatusAfterSignup,
  type DiscoverActivityErrorCode,
} from "@/lib/discover/discover-activity-state";
import {
  discoverActivityForFeedInclude,
  prismaDiscoverActivityToRow,
} from "@/lib/discover/prisma-discover-activity-for-discover";
import { viewerFromUser } from "@/lib/discover/discover-activity-server";

export class DiscoverActivitySignupError extends Error {
  constructor(readonly code: DiscoverActivityErrorCode | "NOT_FOUND") {
    super(code);
    this.name = "DiscoverActivitySignupError";
  }
}

export async function setDiscoverActivitySignup(
  user: User,
  activityId: string,
  going: boolean,
  tx: Prisma.TransactionClient,
) {
  await tx.$executeRaw`SELECT id FROM "DiscoverActivity" WHERE id = ${activityId} FOR UPDATE`;
  const activity = await tx.discoverActivity.findUnique({
    where: { id: activityId },
    include: {
      signups: { select: { userId: true, status: true } },
      _count: {
        select: { signups: { where: { status: DiscoverActivitySignupStatus.GOING } } },
      },
    },
  });
  if (!activity) throw new DiscoverActivitySignupError("NOT_FOUND");

  const blocked = await tx.block.findFirst({
    where: {
      OR: [
        { blockerId: user.id, blockedId: activity.organizerId },
        { blockerId: activity.organizerId, blockedId: user.id },
      ],
    },
    select: { id: true },
  });
  const viewer = viewerFromUser(user, { blockedWithOrganizer: Boolean(blocked) });
  const viewerSignupStatus =
    activity.signups.find((signup) => signup.userId === user.id)?.status ?? null;
  const now = new Date();

  if (going) {
    const check = canSignup(
      {
        ...viewer,
        blockedWithOrganizer: Boolean(blocked),
      },
      {
        ...activity,
        goingCount: activity._count.signups,
        viewerSignupStatus,
      },
      now,
    );
    if (!check.ok && check.code !== "ALREADY_GOING") {
      throw new DiscoverActivitySignupError(check.code);
    }
    if (check.ok) {
      await tx.discoverActivitySignup.upsert({
        where: { activityId_userId: { activityId, userId: user.id } },
        create: { activityId, userId: user.id, status: DiscoverActivitySignupStatus.GOING },
        update: { status: DiscoverActivitySignupStatus.GOING, canceledAt: null },
      });
    }
  } else {
    const check = canCancelSignup(viewer, viewerSignupStatus);
    if (!check.ok) {
      if (check.code === "NOT_GOING") {
        return { changed: false, activity: null };
      }
      throw new DiscoverActivitySignupError(check.code);
    }
    await tx.discoverActivitySignup.update({
      where: { activityId_userId: { activityId, userId: user.id } },
      data: { status: DiscoverActivitySignupStatus.CANCELED, canceledAt: now },
    });
  }

  const goingCount = await tx.discoverActivitySignup.count({
    where: { activityId, status: DiscoverActivitySignupStatus.GOING },
  });
  const nextStatus = going
    ? nextStatusAfterSignup(activity.status, goingCount, activity.capacity)
    : nextStatusAfterCancel(activity.status, goingCount, activity.capacity);
  await tx.discoverActivity.update({ where: { id: activityId }, data: { status: nextStatus } });
  const fresh = await tx.discoverActivity.findUnique({
    where: { id: activityId },
    include: discoverActivityForFeedInclude,
  });
  if (!fresh) throw new DiscoverActivitySignupError("NOT_FOUND");
  return {
    changed: going ? viewerSignupStatus !== DiscoverActivitySignupStatus.GOING : true,
    activity: prismaDiscoverActivityToRow(fresh, user.id, now),
  };
}
