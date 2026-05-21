import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { error, ok } from "@/lib/http";
import { buildOwnerPreviewSnapshotForUserId } from "@/lib/schedule-share/public-snapshot";

export async function GET() {
  const auth = await resolveOnboardedUserForApi();
  if (!auth.ok) return error(auth.error, auth.status);

  try {
    const snapshot = await buildOwnerPreviewSnapshotForUserId(prisma, auth.user.id);
    return ok({ snapshot });
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("GET /api/schedule-shares/owner-preview");
      return error("Database is temporarily unavailable. Try again in a moment.", 503);
    }
    console.error(cause);
    return error("Could not load schedule preview.", 500);
  }
}
