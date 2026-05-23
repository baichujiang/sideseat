import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { deriveActivityPhase } from "@/lib/discover/discover-activity-state";
import {
  discoverActivityForFeedInclude,
  prismaDiscoverActivityToRow,
} from "@/lib/discover/prisma-discover-activity-for-discover";
import { isBlockedBetween } from "@/lib/discover/discover-activity-server";
import { error, ok } from "@/lib/http";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const sessionUser = await getSessionUser();
  const now = new Date();

  const activity = await prisma.discoverActivity.findUnique({
    where: { id },
    include: {
      ...discoverActivityForFeedInclude,
      signups: {
        where: { status: "GOING" },
        select: {
          userId: true,
          status: true,
          user: {
            select: { id: true, nickname: true, avatarUrl: true },
          },
        },
        orderBy: { createdAt: "asc" },
        take: 50,
      },
    },
  });

  if (!activity) {
    return error("Activity not found.", 404);
  }

  if (sessionUser) {
    const blocked = await isBlockedBetween(sessionUser.id, activity.organizerId);
    if (blocked && sessionUser.id !== activity.organizerId) {
      return error("Activity not found.", 404);
    }
  }

  const row = prismaDiscoverActivityToRow(activity, sessionUser?.id ?? null, now);
  const phase = deriveActivityPhase(activity, now);

  const goingAttendees = activity.signups.map((s) => ({
    userId: s.user.id,
    nickname: s.user.nickname,
    avatarUrl: s.user.avatarUrl,
  }));

  let viewerHasExistingChat = false;
  if (sessionUser && sessionUser.id !== activity.organizerId) {
    const connection = await prisma.connection.findFirst({
      where: {
        status: "ACTIVE",
        OR: [
          { userAId: sessionUser.id, userBId: activity.organizerId },
          { userBId: sessionUser.id, userAId: activity.organizerId },
        ],
      },
      select: { id: true },
    });
    viewerHasExistingChat = Boolean(connection);
  }

  const calendarEntry = sessionUser
    ? await prisma.calendarEntry.findFirst({
        where: { userId: sessionUser.id, discoverActivityId: activity.id },
        select: { id: true },
      })
    : null;

  return ok({
    activity: row,
    phase,
    goingAttendees,
    viewerHasExistingChat,
    calendarEntryId: calendarEntry?.id ?? null,
  });
}
