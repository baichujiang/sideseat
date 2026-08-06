import { addDays } from "date-fns";
import type { Prisma, PrismaClient } from "@prisma/client";

import { SCHEDULE_SHARE_DEFAULT_TTL_DAYS, SCHEDULE_SHARE_MAX_TTL_DAYS } from "@/lib/schedule-share/constants";
import { normalizeRevealConfig, validateRevealCategoryOwnership } from "@/lib/schedule-share/reveal-config";
import { publicScheduleShareOrigin } from "@/lib/schedule-share/public-share-origin";
import { scheduleShareRecipientViewUrl } from "@/lib/schedule-share/share-link-urls";
import { generateScheduleShareToken, hashScheduleShareToken } from "@/lib/schedule-share/token";
import { createScheduleShareSchema } from "@/lib/schedule-share/validation";
import type { z } from "zod";

export type CreateScheduleShareInput = z.input<typeof createScheduleShareSchema>;

export async function createScheduleShareLinkForUser(
  db: PrismaClient,
  args: {
    ownerUserId: string;
    input: CreateScheduleShareInput;
    appOrigin: string;
  },
): Promise<{ shareUrl: string; linkId: string }> {
  const rc = args.input.revealConfig;
  const normalizedReveal = normalizeRevealConfig({
    categoryIds: rc.categoryIds ?? [],
    presetKeys: rc.presetKeys ?? [],
    hideAllDetails: rc.hideAllDetails ?? false,
    includedDates: rc.includedDates,
  });

  const owned = await validateRevealCategoryOwnership(db, args.ownerUserId, normalizedReveal.categoryIds);
  if (!owned) {
    throw new Error("INVALID_CATEGORIES");
  }

  const rangeStart = new Date(args.input.rangeStart);
  const rangeEnd = new Date(args.input.rangeEnd);
  const now = new Date();

  let expiresAt: Date;
  if (args.input.expiresAt) {
    expiresAt = new Date(args.input.expiresAt);
    if (expiresAt.getTime() <= now.getTime()) {
      throw new Error("EXPIRY_PAST");
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

  const link = await db.scheduleShareLink.create({
    data: {
      ownerUserId: args.ownerUserId,
      tokenHash,
      rangeStart,
      rangeEnd,
      revealConfig: normalizedReveal as Prisma.InputJsonValue,
      allowGuestProposals: args.input.allowGuestProposals ?? true,
      usageLimit: args.input.usageLimit ?? "SINGLE_USE",
      expiresAt,
    },
    select: { id: true },
  });

  const shareUrl = scheduleShareRecipientViewUrl(
    publicScheduleShareOrigin({
      requestOrigin: args.appOrigin,
      configuredOrigin: process.env.SIDESEAT_PUBLIC_SHARE_ORIGIN,
    }),
    plaintext,
  );
  return { shareUrl, linkId: link.id };
}
