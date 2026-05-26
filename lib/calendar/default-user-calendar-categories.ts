import type { PrismaClient } from "@prisma/client";

import { normalizeCalendarCategoryHex } from "@/lib/calendar/calendar-category-colors";

/**
 * Built-in calendar lists per user (`presetKey` unique per user).
 *
 * These should stay general-purpose. Discover buddy posts no longer use fixed activity buckets,
 * so calendar defaults should not recreate those old buckets as built-in lists.
 */
export const DEFAULT_USER_CALENDAR_PRESETS: ReadonlyArray<{
  presetKey: string;
  name: string;
  color: string;
  sortOrder: number;
}> = [
  { presetKey: "personal", name: "Personal", color: "#EA580C", sortOrder: 0 },
  { presetKey: "work", name: "Work", color: "#1E3A8A", sortOrder: 1 },
  { presetKey: "important", name: "Important", color: "#DC2626", sortOrder: 2 },
  { presetKey: "other", name: "Other", color: "#64748B", sortOrder: 3 },
];

/**
 * Shipped defaults before 2026-05 — upgrade color only when the row still matches one of these
 * legacy hexes (user-customized colors preserved). Multiple entries per key support successive
 * default changes (e.g. Personal grey era → warm default).
 */
const LEGACY_PRESET_COLORS_BY_KEY: Readonly<Record<string, readonly string[]>> = {
  personal: ["#6B7280"],
  work: ["#1E40AF"],
  course: ["#2563EB"],
  study: ["#7C3AED"],
  meal: ["#D97706"],
  sports: ["#16A34A"],
  other: ["#64748B"],
};

/**
 * Retired built-in lists — removed from defaults; delete leftover rows so they
 * no longer appear as immovable “preset” categories (`CalendarEntry.categoryId` → null).
 */
export const OBSOLETE_USER_CALENDAR_PRESET_KEYS = [
  "course",
  "study",
  "meal",
  "language",
  "sports",
  "publicHolidays",
  "publicholidays",
  "public_holidays",
  "publicholiday",
  "public_holiday",
  "universityCalendar",
  "universitycalendar",
  "university_calendar",
] as const;

async function syncPresetSortOrders(prisma: PrismaClient, userId: string): Promise<void> {
  await Promise.all(
    DEFAULT_USER_CALENDAR_PRESETS.map((p) =>
      prisma.userCalendarCategory.updateMany({
        where: { userId, presetKey: p.presetKey },
        data: { sortOrder: p.sortOrder },
      }),
    ),
  );
}

/** If a preset row still matches any legacy shipped hex, move it to the current default (see LEGACY_PRESET_COLORS_BY_KEY). */
async function upgradeLegacyPresetColors(prisma: PrismaClient, userId: string): Promise<void> {
  const nextNormByKey = Object.fromEntries(
    DEFAULT_USER_CALENDAR_PRESETS.map((p) => [p.presetKey, normalizeCalendarCategoryHex(p.color)]),
  );
  for (const [presetKey, legacyHexes] of Object.entries(LEGACY_PRESET_COLORS_BY_KEY)) {
    const nextNorm = nextNormByKey[presetKey];
    if (!nextNorm) continue;
    for (const legacy of legacyHexes) {
      const legacyNorm = normalizeCalendarCategoryHex(legacy);
      if (legacyNorm === nextNorm) continue;
      const legacyColorMatch = [legacyNorm, legacyNorm.toLowerCase()];
      await prisma.userCalendarCategory.updateMany({
        where: { userId, presetKey, color: { in: legacyColorMatch } },
        data: { color: nextNorm },
      });
    }
  }
}

/** Idempotent: insert any missing preset categories for this user; keep preset sort order canonical; optional legacy color lift. */
export async function ensureUserCalendarCategories(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  await prisma.userCalendarCategory.deleteMany({
    where: {
      userId,
      presetKey: { in: [...OBSOLETE_USER_CALENDAR_PRESET_KEYS] },
    },
  });

  const existing = await prisma.userCalendarCategory.findMany({
    where: { userId, presetKey: { not: null } },
    select: { presetKey: true },
  });
  const have = new Set(existing.map((e) => e.presetKey as string));
  const missing = DEFAULT_USER_CALENDAR_PRESETS.filter((p) => !have.has(p.presetKey));
  if (missing.length > 0) {
    await prisma.userCalendarCategory.createMany({
      data: missing.map((p) => ({
        userId,
        name: p.name,
        color: normalizeCalendarCategoryHex(p.color),
        sortOrder: p.sortOrder,
        presetKey: p.presetKey,
      })),
      skipDuplicates: true,
    });
  }

  await syncPresetSortOrders(prisma, userId);
  await upgradeLegacyPresetColors(prisma, userId);
}
