import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  discoverActivityErrorMessage,
  discoverActivityErrorStatus,
} from "@/lib/discover/discover-activity-api-messages";
import { viewerFromUser } from "@/lib/discover/discover-activity-server";
import { error, ok } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: activityId } = await params;
  const user = await getSessionUser();
  const viewer = viewerFromUser(user);
  if (!viewer.userId || viewer.isGuest) {
    const code = !viewer.userId ? "AUTH_REQUIRED" : "ONBOARDING_REQUIRED";
    return error(discoverActivityErrorMessage(code), discoverActivityErrorStatus(code), code);
  }
  if (!user) {
    return error(discoverActivityErrorMessage("AUTH_REQUIRED"), 401, "AUTH_REQUIRED");
  }

  const activity = await prisma.discoverActivity.findUnique({
    where: { id: activityId },
    select: { id: true, title: true, location: true, startAt: true, endAt: true },
  });
  if (!activity) {
    return error("Activity not found.", 404);
  }

  const existing = await prisma.calendarEntry.findFirst({
    where: { userId: user.id, discoverActivityId: activity.id },
    select: { id: true },
  });
  if (existing) {
    return ok({ calendarEntryId: existing.id, created: false });
  }

  const entry = await prisma.calendarEntry.create({
    data: {
      userId: user.id,
      discoverActivityId: activity.id,
      title: activity.title,
      location: activity.location,
      startAt: activity.startAt,
      endAt: activity.endAt,
      source: "discover_activity",
    },
    select: { id: true },
  });

  return ok({ calendarEntryId: entry.id, created: true }, { status: 201 });
}
