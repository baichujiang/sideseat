import { getSessionUser } from "@/lib/auth/session";
import {
  addNativeDiscoverActivityToCalendar,
  NativeDiscoverActivityCalendarError,
} from "@/lib/api/v1/discover-service";
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

  try {
    const data = await addNativeDiscoverActivityToCalendar({
      userId: user.id,
      activityId,
    });
    return ok(data, { status: data.created ? 201 : 200 });
  } catch (cause) {
    if (cause instanceof NativeDiscoverActivityCalendarError) {
      return error("Activity not found.", 404);
    }
    throw cause;
  }
}
