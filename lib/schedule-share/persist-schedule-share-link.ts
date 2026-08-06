import { addDays } from "date-fns";
import type { Prisma, PrismaClient, ScheduleShareLink } from "@prisma/client";

import type { ScheduleShareLinkWithOwner } from "@/lib/schedule-share/resolve-link";

import {
  SCHEDULE_SHARE_DEFAULT_TTL_DAYS,
  SCHEDULE_SHARE_MAX_TTL_DAYS,
} from "@/lib/schedule-share/constants";
import {
  buildOwnerPreviewScheduleShareSnapshotForActiveLink,
  buildPublicScheduleShareSnapshotForActiveLink,
} from "@/lib/schedule-share/public-snapshot";
import {
  normalizeRevealConfig,
  validateRevealCategoryOwnership,
} from "@/lib/schedule-share/reveal-config";
import { createScheduleShareSchema } from "@/lib/schedule-share/validation";

type Db = PrismaClient;

export async function persistScheduleShareLinkUpdate(
  db: Db,
  link: ScheduleShareLink,
  ownerUserId: string,
  raw: unknown,
): Promise<
  | { ok: true; link: ScheduleShareLinkWithOwner }
  | { ok: false; status: number; error: string }
> {
  let body: unknown = raw;
  if (raw instanceof Request) {
    try {
      body = await raw.json();
    } catch {
      return { ok: false, status: 400, error: "Invalid JSON body." };
    }
  }

  const parsed = createScheduleShareSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.issues[0]?.message ?? "Invalid share settings.";
    return { ok: false, status: 400, error: first };
  }

  const rc = parsed.data.revealConfig;
  const normalizedReveal = normalizeRevealConfig({
    categoryIds: rc.categoryIds ?? [],
    presetKeys: rc.presetKeys ?? [],
    hideAllDetails: rc.hideAllDetails ?? false,
    includedDates: rc.includedDates,
  });

  const owned = await validateRevealCategoryOwnership(db, ownerUserId, normalizedReveal.categoryIds);
  if (!owned) {
    return { ok: false, status: 400, error: "One or more calendar categories are invalid." };
  }

  const rangeStart = new Date(parsed.data.rangeStart);
  const rangeEnd = new Date(parsed.data.rangeEnd);
  const now = new Date();

  let expiresAt: Date;
  if (parsed.data.expiresAt) {
    expiresAt = new Date(parsed.data.expiresAt);
    if (expiresAt.getTime() <= now.getTime()) {
      return { ok: false, status: 400, error: "Expiry must be in the future." };
    }
    const maxExp = addDays(now, SCHEDULE_SHARE_MAX_TTL_DAYS);
    if (expiresAt.getTime() > maxExp.getTime()) {
      expiresAt = maxExp;
    }
  } else {
    expiresAt = addDays(now, SCHEDULE_SHARE_DEFAULT_TTL_DAYS);
  }

  await db.scheduleShareLink.update({
    where: { id: link.id },
    data: {
      rangeStart,
      rangeEnd,
      revealConfig: normalizedReveal as Prisma.InputJsonValue,
      allowGuestProposals: parsed.data.allowGuestProposals ?? true,
      usageLimit: parsed.data.usageLimit ?? "SINGLE_USE",
      expiresAt,
    },
  });

  const updated = await db.scheduleShareLink.findUniqueOrThrow({
    where: { id: link.id },
    include: { owner: true },
  });

  return { ok: true, link: updated };
}

export async function buildSnapshotForLink(db: Db, link: ScheduleShareLinkWithOwner) {
  return buildPublicScheduleShareSnapshotForActiveLink(db, link);
}

export async function buildOwnerPreviewSnapshotForLink(db: Db, link: ScheduleShareLinkWithOwner) {
  return buildOwnerPreviewScheduleShareSnapshotForActiveLink(db, link);
}
