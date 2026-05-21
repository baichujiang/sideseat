import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { error, ok, parseBody } from "@/lib/http";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { createScheduleShareLinkForUser } from "@/lib/schedule-share/create-schedule-share-link-server";
import { createScheduleShareSchema } from "@/lib/schedule-share/validation";

export async function GET() {
  const auth = await resolveOnboardedUserForApi();
  if (!auth.ok) return error(auth.error, auth.status);

  try {
  const rows = await prisma.scheduleShareLink.findMany({
    where: { ownerUserId: auth.user.id },
    orderBy: { createdAt: "desc" },
      select: {
      id: true,
      rangeStart: true,
      rangeEnd: true,
      usageLimit: true,
      consumedAt: true,
      expiresAt: true,
      revokedAt: true,
      createdAt: true,
      allowGuestProposals: true,
    },
  });

  return ok({ links: rows });
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("GET /api/schedule-shares");
      return error("Database is temporarily unavailable. Try again in a moment.", 503);
    }
    console.error(cause);
    return error("Could not load schedule share links.", 500);
  }
}

export async function POST(request: Request) {
  try {
    const auth = await resolveOnboardedUserForApi();
    if (!auth.ok) return error(auth.error, auth.status);

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return error("Invalid JSON body.", 400);
    }

    const parsed = parseBody(raw, createScheduleShareSchema);
    if (!parsed.ok) return error(parsed.error, 400);

    const origin = requestAppOrigin(request);
    let shareUrl: string;
    try {
      const created = await createScheduleShareLinkForUser(prisma, {
        ownerUserId: auth.user.id,
        input: parsed.data,
        appOrigin: origin,
      });
      shareUrl = created.shareUrl;
    } catch (cause) {
      if (cause instanceof Error) {
        if (cause.message === "INVALID_CATEGORIES") {
          return error("One or more calendar categories are invalid.", 400);
        }
        if (cause.message === "EXPIRY_PAST") {
          return error("Expiry must be in the future.", 400);
        }
      }
      throw cause;
    }

    return ok({ shareUrl }, { status: 201 });
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("POST /api/schedule-shares");
      return error("Database is temporarily unavailable. Try again in a moment.", 503);
    }
    console.error(cause);
    return error("Could not create schedule share link.", 500);
  }
}
