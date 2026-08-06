import "server-only";

import type { Prisma, PrismaClient } from "@prisma/client";

import { normalizeCalendarCategoryHex } from "@/lib/calendar/calendar-category-colors";
import { ensureUserCalendarCategories } from "@/lib/calendar/default-user-calendar-categories";
import {
  assertPublicHttpUrlForIcsFetch,
  normalizeCalendarSubscriptionUrl,
} from "@/lib/calendar/subscription-url";

type CalendarCategoryDb = Prisma.TransactionClient | PrismaClient;

const calendarCategorySelect = {
  id: true,
  name: true,
  color: true,
  sortOrder: true,
  presetKey: true,
  icsSubscriptionUrl: true,
} satisfies Prisma.UserCalendarCategorySelect;

export type CalendarCategoryDto = Prisma.UserCalendarCategoryGetPayload<{
  select: typeof calendarCategorySelect;
}>;

export class CalendarCategoryNotFoundError extends Error {}
export class BuiltInCalendarDeleteError extends Error {}
export class BuiltInCalendarSubscriptionError extends Error {}
export class InvalidCalendarSubscriptionError extends Error {}

function normalizeSubscriptionUrl(raw: string | null | undefined) {
  if (raw === undefined) return undefined;
  if (raw === null || !raw.trim()) return null;
  const normalized = normalizeCalendarSubscriptionUrl(raw);
  try {
    assertPublicHttpUrlForIcsFetch(normalized);
  } catch (cause) {
    throw new InvalidCalendarSubscriptionError(
      cause instanceof Error ? cause.message : "Invalid calendar URL.",
    );
  }
  return normalized;
}

export function normalizeCalendarCategoryCreateInput(input: {
  name: string;
  color: string;
  icsSubscriptionUrl?: string;
}) {
  return {
    name: input.name.trim(),
    color: normalizeCalendarCategoryHex(input.color),
    icsSubscriptionUrl: normalizeSubscriptionUrl(input.icsSubscriptionUrl) ?? null,
  };
}

export function normalizeCalendarCategoryPatchInput(input: {
  name?: string;
  color?: string;
  icsSubscriptionUrl?: string | null;
}) {
  return {
    ...(input.name !== undefined ? { name: input.name.trim() } : {}),
    ...(input.color !== undefined
      ? { color: normalizeCalendarCategoryHex(input.color) }
      : {}),
    ...(input.icsSubscriptionUrl !== undefined
      ? { icsSubscriptionUrl: normalizeSubscriptionUrl(input.icsSubscriptionUrl) }
      : {}),
  };
}

export async function listCalendarCategoriesForUser(
  db: PrismaClient,
  userId: string,
): Promise<CalendarCategoryDto[]> {
  await ensureUserCalendarCategories(db, userId);
  return db.userCalendarCategory.findMany({
    where: { userId },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: calendarCategorySelect,
  });
}

export async function createCalendarCategoryForUser(
  db: CalendarCategoryDb,
  options: {
    userId: string;
    input: ReturnType<typeof normalizeCalendarCategoryCreateInput>;
  },
): Promise<CalendarCategoryDto> {
  const last = await db.userCalendarCategory.findFirst({
    where: { userId: options.userId },
    orderBy: { sortOrder: "desc" },
    select: { sortOrder: true },
  });
  return db.userCalendarCategory.create({
    data: {
      userId: options.userId,
      name: options.input.name,
      color: options.input.color,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      presetKey: null,
      icsSubscriptionUrl: options.input.icsSubscriptionUrl,
    },
    select: calendarCategorySelect,
  });
}

export async function updateCalendarCategoryForUser(
  db: CalendarCategoryDb,
  options: {
    categoryId: string;
    userId: string;
    input: ReturnType<typeof normalizeCalendarCategoryPatchInput>;
  },
): Promise<CalendarCategoryDto> {
  const existing = await db.userCalendarCategory.findFirst({
    where: { id: options.categoryId, userId: options.userId },
    select: { id: true, presetKey: true },
  });
  if (!existing) throw new CalendarCategoryNotFoundError();
  if (existing.presetKey && options.input.icsSubscriptionUrl !== undefined) {
    throw new BuiltInCalendarSubscriptionError();
  }
  return db.userCalendarCategory.update({
    where: { id: existing.id },
    data: options.input,
    select: calendarCategorySelect,
  });
}

export async function deleteCalendarCategoryForUser(
  db: CalendarCategoryDb,
  options: { categoryId: string; userId: string },
) {
  const existing = await db.userCalendarCategory.findFirst({
    where: { id: options.categoryId, userId: options.userId },
    select: { id: true, presetKey: true, _count: { select: { entries: true } } },
  });
  if (!existing) throw new CalendarCategoryNotFoundError();
  if (existing.presetKey) throw new BuiltInCalendarDeleteError();
  await db.userCalendarCategory.delete({ where: { id: existing.id } });
  return {
    categoryId: existing.id,
    deleted: true,
    detachedEventCount: existing._count.entries,
  };
}
