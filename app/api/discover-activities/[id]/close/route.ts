import { DiscoverActivityStatus } from "@prisma/client";

import { getSessionUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import {
  discoverActivityErrorMessage,
  discoverActivityErrorStatus,
} from "@/lib/discover/discover-activity-api-messages";
import { canClose } from "@/lib/discover/discover-activity-state";
import {
  discoverActivityForFeedInclude,
  prismaDiscoverActivityToRow,
} from "@/lib/discover/prisma-discover-activity-for-discover";
import { viewerFromUser } from "@/lib/discover/discover-activity-server";
import { error, ok } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const user = await getSessionUser();
  const viewer = viewerFromUser(user);

  const activity = await prisma.discoverActivity.findUnique({ where: { id } });
  if (!activity) {
    return error("Activity not found.", 404);
  }

  if (!canClose(viewer, activity, new Date())) {
    return error(
      discoverActivityErrorMessage("ORGANIZER_ONLY"),
      discoverActivityErrorStatus("ORGANIZER_ONLY"),
      "ORGANIZER_ONLY",
    );
  }

  const updated = await prisma.discoverActivity.update({
    where: { id },
    data: { status: DiscoverActivityStatus.CLOSED },
    include: discoverActivityForFeedInclude,
  });

  const row = prismaDiscoverActivityToRow(updated, user?.id ?? null, new Date());
  return ok({ activity: row });
}
