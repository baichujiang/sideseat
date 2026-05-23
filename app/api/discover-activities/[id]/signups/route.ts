import { DiscoverActivitySignupStatus } from "@prisma/client";

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  discoverActivityErrorMessage,
  discoverActivityErrorStatus,
} from "@/lib/discover/discover-activity-api-messages";
import {
  canCancelSignup,
  canSignup,
  nextStatusAfterCancel,
  nextStatusAfterSignup,
} from "@/lib/discover/discover-activity-state";
import {
  discoverActivityForFeedInclude,
  prismaDiscoverActivityToRow,
} from "@/lib/discover/prisma-discover-activity-for-discover";
import { isBlockedBetween, viewerFromUser } from "@/lib/discover/discover-activity-server";
import { error, ok } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: activityId } = await params;
  const user = await getSessionUser();
  const viewer = viewerFromUser(user);

  try {
    const result = await prisma.$transaction(async (tx) => {
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

      if (!activity) return { kind: "not_found" as const };

      const blocked = user
        ? await isBlockedBetween(user.id, activity.organizerId)
        : false;
      const signupCtx = {
        ...activity,
        goingCount: activity._count.signups,
        viewerSignupStatus:
          activity.signups.find((s) => s.userId === user?.id)?.status ?? null,
      };

      const check = canSignup(
        { ...viewer, blockedWithOrganizer: blocked },
        signupCtx,
        new Date(),
      );

      if (!check.ok) {
        if (check.code === "ALREADY_GOING") {
          const fresh = await tx.discoverActivity.findUnique({
            where: { id: activityId },
            include: discoverActivityForFeedInclude,
          });
          return { kind: "ok" as const, activity: fresh, status: 200 };
        }
        return { kind: "error" as const, code: check.code };
      }

      if (!user) return { kind: "error" as const, code: "AUTH_REQUIRED" as const };

      await tx.discoverActivitySignup.upsert({
        where: { activityId_userId: { activityId, userId: user.id } },
        create: {
          activityId,
          userId: user.id,
          status: DiscoverActivitySignupStatus.GOING,
        },
        update: {
          status: DiscoverActivitySignupStatus.GOING,
          canceledAt: null,
        },
      });

      const goingCount = await tx.discoverActivitySignup.count({
        where: { activityId, status: DiscoverActivitySignupStatus.GOING },
      });

      const nextStatus = nextStatusAfterSignup(activity.status, goingCount, activity.capacity);
      await tx.discoverActivity.update({
        where: { id: activityId },
        data: { status: nextStatus },
      });

      const fresh = await tx.discoverActivity.findUnique({
        where: { id: activityId },
        include: discoverActivityForFeedInclude,
      });

      return { kind: "ok" as const, activity: fresh, status: 201 };
    });

    if (result.kind === "not_found") {
      return error("Activity not found.", 404);
    }
    if (result.kind === "error") {
      return error(
        discoverActivityErrorMessage(result.code),
        discoverActivityErrorStatus(result.code),
        result.code,
      );
    }
    if (!result.activity || !user) {
      return error("Activity not found.", 404);
    }

    const row = prismaDiscoverActivityToRow(result.activity, user.id, new Date());
    return ok({ activity: row }, { status: result.status });
  } catch (err) {
    console.error("POST signups", err);
    return error("Unable to sign up.", 500);
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: activityId } = await params;
  const user = await getSessionUser();
  const viewer = viewerFromUser(user);

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT id FROM "DiscoverActivity" WHERE id = ${activityId} FOR UPDATE`;

      const activity = await tx.discoverActivity.findUnique({
        where: { id: activityId },
        include: {
          signups: { where: { userId: user?.id ?? "" }, select: { status: true } },
        },
      });

      if (!activity) return { kind: "not_found" as const };

      const viewerSignupStatus = activity.signups[0]?.status ?? null;
      const cancelCheck = canCancelSignup(viewer, viewerSignupStatus);
      if (!cancelCheck.ok) {
        if (cancelCheck.code === "NOT_GOING") {
          return { kind: "noop" as const };
        }
        return { kind: "error" as const, code: cancelCheck.code };
      }

      if (!user) return { kind: "error" as const, code: "AUTH_REQUIRED" as const };

      await tx.discoverActivitySignup.update({
        where: { activityId_userId: { activityId, userId: user.id } },
        data: {
          status: DiscoverActivitySignupStatus.CANCELED,
          canceledAt: new Date(),
        },
      });

      const goingCount = await tx.discoverActivitySignup.count({
        where: { activityId, status: DiscoverActivitySignupStatus.GOING },
      });

      const nextStatus = nextStatusAfterCancel(activity.status, goingCount, activity.capacity);
      await tx.discoverActivity.update({
        where: { id: activityId },
        data: { status: nextStatus },
      });

      const fresh = await tx.discoverActivity.findUnique({
        where: { id: activityId },
        include: discoverActivityForFeedInclude,
      });

      return { kind: "ok" as const, activity: fresh };
    });

    if (result.kind === "not_found") {
      return error("Activity not found.", 404);
    }
    if (result.kind === "noop") {
      return new Response(null, { status: 204 });
    }
    if (result.kind === "error") {
      return error(
        discoverActivityErrorMessage(result.code),
        discoverActivityErrorStatus(result.code),
        result.code,
      );
    }
    if (!result.activity || !user) {
      return error("Activity not found.", 404);
    }

    const row = prismaDiscoverActivityToRow(result.activity, user.id, new Date());
    return ok({ activity: row });
  } catch (err) {
    console.error("DELETE signups", err);
    return error("Unable to cancel sign-up.", 500);
  }
}
