import { addDays } from "date-fns";
import type { Prisma } from "@prisma/client";

import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { resolveOnboardedUserForApi } from "@/lib/auth/guards";
import { error, ok, parseBody } from "@/lib/http";
import { requestAppOrigin } from "@/lib/http/request-app-origin";
import { SCHEDULE_SHARE_DEFAULT_TTL_DAYS, SCHEDULE_SHARE_MAX_TTL_DAYS } from "@/lib/schedule-share/constants";
import { normalizeRevealConfig, validateRevealCategoryOwnership } from "@/lib/schedule-share/reveal-config";
import { generateScheduleShareToken, hashScheduleShareToken } from "@/lib/schedule-share/token";
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

    const rc = parsed.data.revealConfig;
    const normalizedReveal = normalizeRevealConfig({
      categoryIds: rc.categoryIds ?? [],
      presetKeys: rc.presetKeys ?? [],
    });

    const owned = await validateRevealCategoryOwnership(prisma, auth.user.id, normalizedReveal.categoryIds);
    if (!owned) {
      return error("One or more calendar categories are invalid.", 400);
    }

    const rangeStart = new Date(parsed.data.rangeStart);
    const rangeEnd = new Date(parsed.data.rangeEnd);
    const now = new Date();

    let expiresAt: Date;
    if (parsed.data.expiresAt) {
      expiresAt = new Date(parsed.data.expiresAt);
      if (expiresAt.getTime() <= now.getTime()) {
        return error("Expiry must be in the future.", 400);
      }
      const maxExp = addDays(now, SCHEDULE_SHARE_MAX_TTL_DAYS);
      if (expiresAt.getTime() > maxExp.getTime()) {
        expiresAt = maxExp;
      }
    } else {
      expiresAt = addDays(now, SCHEDULE_SHARE_DEFAULT_TTL_DAYS);
    }

    const plaintext = generateScheduleShareToken();
    const tokenHash = hashScheduleShareToken(plaintext);

    await prisma.scheduleShareLink.create({
      data: {
        ownerUserId: auth.user.id,
        tokenHash,
        rangeStart,
        rangeEnd,
        revealConfig: normalizedReveal as Prisma.InputJsonValue,
        allowGuestProposals: parsed.data.allowGuestProposals ?? true,
        usageLimit: parsed.data.usageLimit ?? "UNLIMITED",
        expiresAt,
      },
    });

    const origin = requestAppOrigin(request);
    const shareUrl = `${origin}/share/schedule/${encodeURIComponent(plaintext)}`;

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
