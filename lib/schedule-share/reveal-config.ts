import type { PrismaClient } from "@prisma/client";
import { z } from "zod";

export const REVEAL_PRESET_KEYS_ALLOWLIST = ["course", "personal", "work", "other"] as const;
export type RevealPresetKeyAllowlisted = (typeof REVEAL_PRESET_KEYS_ALLOWLIST)[number];

export type NormalizedRevealConfig = {
  categoryIds: string[];
  presetKeys: string[];
};

const presetEnum = z.enum(REVEAL_PRESET_KEYS_ALLOWLIST);

export const revealConfigSchema = z.object({
  categoryIds: z.array(z.string().trim().min(1)).default([]),
  presetKeys: z.array(presetEnum).default([]),
});

export function normalizeRevealConfig(raw: z.infer<typeof revealConfigSchema>): NormalizedRevealConfig {
  const categoryIds = [...new Set(raw.categoryIds.map((id) => id.trim()))].filter(Boolean).sort();
  const presetKeys = [...new Set(raw.presetKeys)].sort();
  return { categoryIds, presetKeys };
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

export function isBlockRevealed(block: InternalBlockRevealFields, reveal: NormalizedRevealConfig): boolean {
  if (block.internalCategoryId && reveal.categoryIds.includes(block.internalCategoryId)) return true;
  const pk = block.internalPresetKey;
  if (pk && reveal.presetKeys.includes(pk)) return true;
  return false;
}
