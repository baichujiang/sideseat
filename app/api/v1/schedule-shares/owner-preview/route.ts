import { requireV1User } from "@/lib/api/v1/auth";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { buildOwnerPreviewSnapshotForUserId } from "@/lib/schedule-share/public-snapshot";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  try {
    const snapshot = await buildOwnerPreviewSnapshotForUserId(prisma, auth.user.id);
    return v1Success({ snapshot }, { request });
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("GET /api/v1/schedule-shares/owner-preview");
      return v1Error(request, {
        code: "INTERNAL_ERROR",
        message: "Database is temporarily unavailable. Try again in a moment.",
        status: 503,
        retryable: true,
      });
    }
    console.error("GET /api/v1/schedule-shares/owner-preview", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "The schedule preview could not be loaded.",
      status: 500,
      retryable: true,
    });
  }
}
