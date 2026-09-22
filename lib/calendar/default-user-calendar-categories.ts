import type { PrismaClient } from "@prisma/client";

import { normalizeCalendarCategoryHex } from "@/lib/calendar/calendar-category-colors";

/**
 * Starter calendar lists per user (`presetKey` unique per user).
 *
 * These are seeded once, then behave like user-owned calendars: users may rename, recolor, or
 * delete them without the server recreating them on the next load.
 */
export const DEFAULT_USER_CALENDAR_PRESETS: ReadonlyArray<{
  presetKey: string;
  name: string;
  color: string;
  sortOrder: number;
}> = [
  // Semantic palette: focused purple, professional blue, and warm brand-adjacent rose.
  { presetKey: "study", name: "Study", color: "#7C3AED", sortOrder: 0 },
  { presetKey: "work", name: "Work", color: "#2563EB", sortOrder: 1 },
  { presetKey: "personal", name: "Personal", color: "#DB2777", sortOrder: 2 },
];

/**
 * Shipped defaults before 2026-05 — upgrade color only when the row still matches one of these
 * legacy hexes (user-customized colors preserved). Multiple entries per key support successive
 * default changes (e.g. Personal grey era → warm default).
 */
const LEGACY_PRESET_COLORS_BY_KEY: Readonly<Record<string, readonly string[]>> = {
  personal: ["#6B7280", "#EA580C"],
  work: ["#1E40AF", "#1E3A8A", "#0D9488"],
  course: ["#2563EB"],
  study: ["#2563EB"],
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

const RETIRED_GENERAL_PRESET_KEYS = ["important", "other"] as const;

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

async function removeUnusedRetiredPresets(prisma: PrismaClient, userId: string): Promise<void> {
  const retired = await prisma.userCalendarCategory.findMany({
    where: { userId, presetKey: { in: [...RETIRED_GENERAL_PRESET_KEYS] } },
    select: { id: true, _count: { select: { entries: true } } },
  });
  const unusedIds = retired
    .filter((category) => category._count.entries === 0)
    .map((category) => category.id);
  if (unusedIds.length > 0) {
    await prisma.userCalendarCategory.deleteMany({ where: { id: { in: unusedIds } } });
  }
}

/** Idempotent and one-shot: seed starter calendars and migrate retired defaults without data loss. */
export async function ensureUserCalendarCategories(
  prisma: PrismaClient,
  userId: string,
): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { calendarCategoriesInitializedAt: true },
  });
  if (!user || user.calendarCategoriesInitializedAt) return;

  await prisma.userCalendarCategory.deleteMany({
    where: {
      userId,
      presetKey: { in: [...OBSOLETE_USER_CALENDAR_PRESET_KEYS] },
    },
  });

  // Keep retired categories that still contain events so old schedules and share links remain valid.
  await removeUnusedRetiredPresets(prisma, userId);

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
  await prisma.user.update({
    where: { id: userId },
    data: { calendarCategoriesInitializedAt: new Date() },
  });
}
