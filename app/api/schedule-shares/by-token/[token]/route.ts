import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { error, ok } from "@/lib/http";
import { parseRevealConfigJson } from "@/lib/schedule-share/reveal-config";
import {
  buildSnapshotForLink,
  persistScheduleShareLinkUpdate,
} from "@/lib/schedule-share/persist-schedule-share-link";
import { findScheduleShareLinkByPlainToken } from "@/lib/schedule-share/resolve-link";
import { isScheduleShareOwner } from "@/lib/schedule-share/usage-limit";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  try {
    const auth = await resolveOnboardedUserForApi();
    if (!auth.ok) return error(auth.error, auth.status);

    const { token } = await params;
    const decoded = decodeURIComponent(token);
    const resolved = await findScheduleShareLinkByPlainToken(prisma, decoded, {
      viewerUserId: auth.user.id,
    });
    if (!resolved.ok) {
      return error("Schedule share link not found.", 404);
    }
    if (!isScheduleShareOwner(resolved.link, auth.user.id)) {
      return error("Forbidden.", 403);
    }

    const result = await persistScheduleShareLinkUpdate(
      prisma,
      resolved.link,
      auth.user.id,
      request,
    );
    if (!result.ok) {
      return error(result.error, result.status);
    }

    const snapshot = await buildSnapshotForLink(prisma, result.link);
    const reveal = parseRevealConfigJson(result.link.revealConfig);

    return ok({
      snapshot,
      settings: {
        rangeStart: result.link.rangeStart.toISOString(),
        rangeEnd: result.link.rangeEnd.toISOString(),
        revealConfig: reveal,
        allowGuestProposals: result.link.allowGuestProposals,
        usageLimit: result.link.usageLimit,
        expiresAt: result.link.expiresAt.toISOString(),
      },
    });
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("PATCH /api/schedule-shares/by-token/[token]");
      return error("Database is temporarily unavailable. Try again in a moment.", 503);
    }
    console.error(cause);
    return error("Could not update schedule share link.", 500);
  }
}
