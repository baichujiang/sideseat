/**
 * Pure helpers for Buddy Request plan rows.
 * Do not infer clock time from body. studyMeta.timeSlots = preference only.
 * For real event windows add startsAt/endsAt to schema + create flow (see product plan).
 */

import { ClassmatePostCategory } from "@prisma/client";

import type { BuddyRequestDisplayStatus } from "@/lib/discover/buddy-request-status";
import type { DiscoverPostRowMealsMeta, DiscoverPostRowStudyMeta } from "@/lib/discover/discover-post-row";
import { formatMealsVenueLine, formatStudyVenueLine } from "@/lib/discover/format-post-venue-line";
import { studyTimeSlotLabel } from "@/lib/discover/study-meta-labels";
import type { AppLocale } from "@/lib/i18n/app-locale";
import { formatClassmatePostExpiryFullDate } from "@/lib/i18n/format-classmate-post-expiry";
import { formatMessage, getMessages } from "@/lib/i18n/messages";

export function buddyRequestPreferredTimeValue(
  locale: AppLocale,
  studyMeta: DiscoverPostRowStudyMeta | null | undefined,
): string | null {
  const slots = studyMeta?.timeSlots;
  if (!slots?.length) return null;
  const dl = getMessages(locale).discoverList;
  return slots.slice(0, 4).map((s) => studyTimeSlotLabel(s, dl)).join(" · ");
}

export function buddyRequestWhereValue(
  locale: AppLocale,
  category: ClassmatePostCategory,
  mealsMeta: DiscoverPostRowMealsMeta | null | undefined,
  studyMeta: DiscoverPostRowStudyMeta | null | undefined,
): string | null {
  const dl = getMessages(locale).discoverList;
  if (category === ClassmatePostCategory.MEALS && mealsMeta) {
    const line = formatMealsVenueLine(mealsMeta, dl).trim();
    return line || null;
  }
  if (category === ClassmatePostCategory.STUDY && studyMeta) {
    const line = formatStudyVenueLine(studyMeta, dl).trim();
    return line || null;
  }
  return null;
}

/** Single-line availability for the plan card (dynamic copy by display status). */
export function buddyRequestAvailabilityValue(
  locale: AppLocale,
  display: BuddyRequestDisplayStatus,
  expiresAt: Date,
  updatedAt: Date,
): string {
  const d = getMessages(locale).discoverBuddyDetail;
  const dateFmt = (dt: Date) => formatClassmatePostExpiryFullDate(dt, locale);
  switch (display) {
    case "open":
      return formatMessage(d.availabilityActiveUntil, { date: dateFmt(expiresAt) });
    case "expired":
      return formatMessage(d.availabilityExpiredOn, { date: dateFmt(expiresAt) });
    case "closed":
    default:
      return formatMessage(d.availabilityClosedOn, { date: dateFmt(updatedAt) });
  }
}

export function buddyRequestStatusLabel(
  locale: AppLocale,
  display: BuddyRequestDisplayStatus,
): string {
  const d = getMessages(locale).discoverBuddyDetail;
  switch (display) {
    case "open":
      return d.statusOpen;
    case "expired":
      return d.statusExpired;
    case "closed":
    default:
      return d.statusClosed;
  }
}
