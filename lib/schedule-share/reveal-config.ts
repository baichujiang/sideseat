import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

import { SCHEDULE_SHARE_MAX_RANGE_DAYS } from "@/lib/schedule-share/constants";

export const REVEAL_PRESET_KEYS_ALLOWLIST = ["course", "personal", "work", "other"] as const;
export type RevealPresetKeyAllowlisted = (typeof REVEAL_PRESET_KEYS_ALLOWLIST)[number];

const isoDateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export type NormalizedRevealConfig = {
  categoryIds: string[];
  presetKeys: string[];
  /** Berlin yyyy-MM-dd keys; when set, only these days within [rangeStart, rangeEnd] are shared. */
  includedDates: string[];
};

const presetEnum = z.enum(REVEAL_PRESET_KEYS_ALLOWLIST);

export const revealConfigSchema = z.object({
  categoryIds: z.array(z.string().trim().min(1)).default([]),
  presetKeys: z.array(presetEnum).default([]),
  includedDates: z.array(isoDateOnly).max(SCHEDULE_SHARE_MAX_RANGE_DAYS).optional(),
});

export function normalizeRevealConfig(raw: z.infer<typeof revealConfigSchema>): NormalizedRevealConfig {
  const categoryIds = [...new Set(raw.categoryIds.map((id) => id.trim()))].filter(Boolean).sort();
  const presetKeys = [...new Set(raw.presetKeys)].sort();
  const includedDates = raw.includedDates?.length
    ? [...new Set(raw.includedDates)].sort()
    : [];
  return { categoryIds, presetKeys, includedDates };
}

/** Parse untrusted JSON (e.g. from DB). Throws ZodError if invalid. */
export function parseRevealConfigJson(json: unknown): NormalizedRevealConfig {
  const parsed = revealConfigSchema.parse(json);
  return normalizeRevealConfig(parsed);
}

export async function validateRevealCategoryOwnership(
  prisma: Pick<PrismaClient, "userCalendarCategory">,
  ownerUserId: string,
  categoryIds: string[],
): Promise<boolean> {
  if (categoryIds.length === 0) return true;
  const count = await prisma.userCalendarCategory.count({
    where: { userId: ownerUserId, id: { in: categoryIds } },
  });
  return count === categoryIds.length;
}

export type InternalBlockRevealFields = {
  internalCategoryId?: string | null;
  internalPresetKey?: string | null;
};

export function shareIncludedDateKeySet(
  reveal: NormalizedRevealConfig,
): ReadonlySet<string> | null {
  return reveal.includedDates.length > 0 ? new Set(reveal.includedDates) : null;
}

/** Legacy links with empty reveal lists are treated as “show everything”. */
export function isRevealUnrestricted(reveal: Pick<NormalizedRevealConfig, "categoryIds" | "presetKeys">): boolean {
  return reveal.categoryIds.length === 0 && reveal.presetKeys.length === 0;
}

export function isBlockRevealed(block: InternalBlockRevealFields, reveal: NormalizedRevealConfig): boolean {
  if (isRevealUnrestricted(reveal)) return true;
  if (block.internalCategoryId && reveal.categoryIds.includes(block.internalCategoryId)) return true;
  const pk = block.internalPresetKey;
  if (pk && reveal.presetKeys.includes(pk)) return true;
  return false;
}
