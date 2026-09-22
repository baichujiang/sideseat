import "server-only";

import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db/prisma";
import type { SocialPreferencesPatchInput } from "@/lib/validators/social-preferences";

export function defaultSocialPreferenceExpiry(
  timeZone: string,
  now = new Date(),
): Date {
  const zoned = toZonedTime(now, timeZone);
  const daysUntilSunday = (7 - zoned.getDay()) % 7;
  const target = addDays(zoned, daysUntilSunday);
  const dateKey = formatInTimeZone(target, timeZone, "yyyy-MM-dd");
  return fromZonedTime(`${dateKey}T23:59:59.999`, timeZone);
}

function socialPreferenceResponse(row: {
  topics: string[];
  meetingPreference: string;
  weeklyWindows: Prisma.JsonValue;
  timeZone: string;
  activeUntil: Date;
  updatedAt: Date;
} | null, languages: string[]) {
  return {
    preference: row
      ? {
          topics: row.topics,
          meetingPreference: row.meetingPreference,
          weeklyWindows: row.weeklyWindows,
          timeZone: row.timeZone,
          activeUntil: row.activeUntil.toISOString(),
          isActive: row.activeUntil > new Date(),
          updatedAt: row.updatedAt.toISOString(),
        }
      : null,
    languages,
  };
}

export async function loadSocialPreferences(userId: string) {
  const [preference, languages] = await Promise.all([
    prisma.userSocialPreference.findUnique({ where: { userId } }),
    prisma.userLanguage.findMany({
      where: { userId },
      select: { tag: true },
      orderBy: { tag: "asc" },
    }),
  ]);
  return socialPreferenceResponse(
    preference,
    languages.map((language) => language.tag),
  );
}

export async function updateSocialPreferences(
  userId: string,
  input: SocialPreferencesPatchInput,
) {
  const now = new Date();
  const requestedExpiry = input.activeUntil
    ? new Date(input.activeUntil)
    : defaultSocialPreferenceExpiry(input.timeZone, now);
  const maxExpiry = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1_000);
  if (requestedExpiry <= now || requestedExpiry > maxExpiry) {
    throw new Error("SOCIAL_PREFERENCE_EXPIRY_INVALID");
  }
  const preference = await prisma.userSocialPreference.upsert({
    where: { userId },
    create: {
      userId,
      topics: input.topics,
      meetingPreference: input.meetingPreference,
      weeklyWindows: input.weeklyWindows,
      timeZone: input.timeZone,
      activeUntil: requestedExpiry,
    },
    update: {
      topics: input.topics,
      meetingPreference: input.meetingPreference,
      weeklyWindows: input.weeklyWindows,
      timeZone: input.timeZone,
      activeUntil: requestedExpiry,
    },
  });
  const languages = await prisma.userLanguage.findMany({
    where: { userId },
    select: { tag: true },
    orderBy: { tag: "asc" },
  });
  return socialPreferenceResponse(
    preference,
    languages.map((language) => language.tag),
  );
}

