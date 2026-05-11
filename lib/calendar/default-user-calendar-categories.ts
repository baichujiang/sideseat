import type { PrismaClient } from "@prisma/client";

import { normalizeCalendarCategoryHex } from "@/lib/calendar/calendar-category-colors";

/**
 * Built-in calendar lists per user (`presetKey` unique per user).
 *
 * **Display / creation order** (`sortOrder` ascending): Personal and Work first, then the five
 * activity presets (course → study → meal → language → sports), then Other.
 *
 * **Default colors** for the five activity rows follow Discover classmates scene tabs
 * (`components/discover/discover-list.tsx` + `lib/discover/scene-palette.ts`): each hex is the
 * approximate Tailwind `*-600` stroke used by Lucide icons there (light mode). Slight deviation is
 * normal between Tailwind tokens and sRGB rounding.
 *
 * Personal / Work are neutral/office tones (no matching scene tab); values are chosen to read
 * clearly next to the saturated activity colors.
 */
export const DEFAULT_USER_CALENDAR_PRESETS: ReadonlyArray<{
  presetKey: string;
  name: string;
  color: string;
  sortOrder: number;
}> = [
  { presetKey: "personal", name: "Personal", color: "#6B7280", sortOrder: 0 },
  { presetKey: "work", name: "Work", color: "#1E40AF", sortOrder: 1 },
  /** 课程 — aligned with Discover “Shared courses” tab (teal icon ≈ teal-600). */
  { presetKey: "course", name: "Course", color: "#0D9488", sortOrder: 2 },
  /** 学习 — Discover Study tab (indigo-600). */
  { presetKey: "study", name: "Study", color: "#4F46E5", sortOrder: 3 },
  /** 用餐 — Discover Meals tab (amber-600). */
  { presetKey: "meal", name: "Meals", color: "#D97706", sortOrder: 4 },
  /** 语言 — Discover Language tab (violet-600). */
  { presetKey: "language", name: "Language", color: "#7C3AED", sortOrder: 5 },
  /** 运动 — Discover Sports tab (rose-600). */
  { presetKey: "sports", name: "Sports", color: "#E11D48", sortOrder: 6 },
  { presetKey: "other", name: "Other", color: "#64748B", sortOrder: 7 },
];

/** Shipped defaults before 2026-05 — upgrade color only when the row still matches (user-customized colors preserved). */
const LEGACY_PRESET_COLOR_BY_KEY: Readonly<Record<string, string>> = {
  course: "#2563EB",
  study: "#7C3AED",
  personal: "#EA580C",
  meal: "#D97706",
  sports: "#16A34A",
  other: "#64748B",
};

/**
 * Retired built-in lists — removed from defaults; delete leftover rows so they
 * no longer appear as immovable “preset” categories (`CalendarEntry.categoryId` → null).
 */
export const OBSOLETE_USER_CALENDAR_PRESET_KEYS = [
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

/** If a preset row still uses a legacy shipped hex, move it to the current default (see LEGACY_PRESET_COLOR_BY_KEY). */
async function upgradeLegacyPresetColors(prisma: PrismaClient, userId: string): Promise<void> {
  for (const p of DEFAULT_USER_CALENDAR_PRESETS) {
    const legacy = LEGACY_PRESET_COLOR_BY_KEY[p.presetKey];
    if (!legacy) continue;
    const legacyNorm = normalizeCalendarCategoryHex(legacy);
    const nextNorm = normalizeCalendarCategoryHex(p.color);
    if (legacyNorm === nextNorm) continue;
    const legacyColorMatch = [legacyNorm, legacyNorm.toLowerCase()];
    await prisma.userCalendarCategory.updateMany({
      where: { userId, presetKey: p.presetKey, color: { in: legacyColorMatch } },
      data: { color: nextNorm },
    });
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
