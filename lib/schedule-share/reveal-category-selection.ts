import { normalizeCalendarCategoryHex } from "@/lib/calendar/calendar-category-colors";
import {
  REVEAL_PRESET_KEYS_ALLOWLIST,
  type NormalizedRevealConfig,
  type RevealPresetKeyAllowlisted,
} from "@/lib/schedule-share/reveal-config";

export type ShareRevealCategoryInput = {
  id: string;
  name: string;
  presetKey: string | null;
  color: string;
};

export function shareRevealCategoryColor(color: string): string {
  const trimmed = color.trim();
  return normalizeCalendarCategoryHex(trimmed) ?? "#64748B";
}

export function initialRevealedCategoryIds(
  categories: readonly ShareRevealCategoryInput[],
  reveal: Pick<NormalizedRevealConfig, "categoryIds" | "presetKeys">,
): string[] {
  if (reveal.categoryIds.length === 0 && reveal.presetKeys.length === 0) {
    return allRevealedCategoryIds(categories);
  }
  const ids = new Set<string>(reveal.categoryIds);
  for (const c of categories) {
    if (c.presetKey && reveal.presetKeys.includes(c.presetKey)) {
      ids.add(c.id);
    }
  }
  return [...ids].sort();
}

export function revealConfigFromRevealedCategoryIds(
  categories: readonly ShareRevealCategoryInput[],
  revealedCategoryIds: readonly string[],
): { categoryIds: string[]; presetKeys: RevealPresetKeyAllowlisted[] } {
  const idSet = new Set(revealedCategoryIds);
  const categoryIds: string[] = [];
  const presetKeys: RevealPresetKeyAllowlisted[] = [];

  for (const c of categories) {
    if (!idSet.has(c.id)) continue;
    const pk = c.presetKey;
    if (pk && (REVEAL_PRESET_KEYS_ALLOWLIST as readonly string[]).includes(pk)) {
      presetKeys.push(pk as RevealPresetKeyAllowlisted);
    } else {
      categoryIds.push(c.id);
    }
  }

  return {
    categoryIds: [...new Set(categoryIds)].sort(),
    presetKeys: [...new Set(presetKeys)].sort(),
  };
}

export function allRevealedCategoryIds(categories: readonly ShareRevealCategoryInput[]): string[] {
  return categories.map((c) => c.id);
}

export function isAllCategoriesRevealed(
  categories: readonly ShareRevealCategoryInput[],
  revealedCategoryIds: readonly string[],
): boolean {
  if (categories.length === 0) return false;
  const set = new Set(revealedCategoryIds);
  return categories.every((c) => set.has(c.id));
}

export function isNoCategoriesRevealed(
  categories: readonly ShareRevealCategoryInput[],
  revealedCategoryIds: readonly string[],
): boolean {
  if (categories.length === 0) return false;
  const revealed = new Set(revealedCategoryIds);
  return !categories.some((c) => revealed.has(c.id));
}

/** Default create payload: reveal every preset; custom calendars added when known. */
export function defaultRevealConfigForCategories(
  categories: readonly ShareRevealCategoryInput[],
): { categoryIds: string[]; presetKeys: RevealPresetKeyAllowlisted[] } {
  return revealConfigFromRevealedCategoryIds(categories, allRevealedCategoryIds(categories));
}
