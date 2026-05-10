import type { PrismaClient } from "@prisma/client";

/** Preset rows created per user (distinct colors). */
export const DEFAULT_USER_CALENDAR_PRESETS: ReadonlyArray<{
  presetKey: string;
  name: string;
  color: string;
  sortOrder: number;
}> = [
  { presetKey: "course", name: "Course", color: "#2563EB", sortOrder: 0 },
  { presetKey: "study", name: "Study", color: "#7C3AED", sortOrder: 1 },
  { presetKey: "personal", name: "Personal", color: "#EA580C", sortOrder: 2 },
  { presetKey: "meal", name: "Meals", color: "#D97706", sortOrder: 3 },
  { presetKey: "sports", name: "Sports", color: "#16A34A", sortOrder: 4 },
  { presetKey: "other", name: "Other", color: "#64748B", sortOrder: 5 },
];

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

/** Idempotent: insert any missing preset categories for this user. */
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
  if (missing.length === 0) return;
  await prisma.userCalendarCategory.createMany({
    data: missing.map((p) => ({
      userId,
      name: p.name,
      color: p.color,
      sortOrder: p.sortOrder,
      presetKey: p.presetKey,
    })),
    skipDuplicates: true,
  });
}
