import { fetchIcsSubscriptionText } from "@/lib/calendar/fetch-ics-subscription";
import { makeIcsFeedStudyEntryId } from "@/lib/calendar/ics-feed-event-id";
import { parseIcsForSubscriptionWindow } from "@/lib/calendar/ical-import-parse";
import type { CalendarRepeatRule } from "@prisma/client";

export type SubscriptionCategoryInput = {
  id: string;
  name: string;
  color: string;
  icsSubscriptionUrl: string | null;
};

export type SubscriptionStudyEntryShape = {
  id: string;
  title: string;
  location: string | null;
  withLabel: string | null;
  note: string | null;
  repeatRule: CalendarRepeatRule;
  repeatUntilISO: string | null;
  eventParticipants: Array<{ userId: string | null; name: string }>;
  startISO: string;
  endISO: string;
  categoryId: string | null;
  categoryColor: string | null;
  categoryName: string | null;
};

export async function loadIcsSubscriptionStudyEntries(args: {
  categories: SubscriptionCategoryInput[];
  windowStart: Date;
  windowEnd: Date;
  /** When set, return partial/empty results instead of blocking page render on slow feeds. */
  maxWaitMs?: number;
}): Promise<SubscriptionStudyEntryShape[]> {
  const load = async () => {
    const feeds = args.categories.filter((c) => c.icsSubscriptionUrl?.trim());
    if (feeds.length === 0) return [];

    const results = await Promise.all(
      feeds.map(async (cat) => {
        const url = cat.icsSubscriptionUrl!.trim();
        try {
          const raw = await fetchIcsSubscriptionText(url);
          const { events } = parseIcsForSubscriptionWindow(raw, args.windowStart, args.windowEnd);
          return events.map((ev, index) => ({
            id: makeIcsFeedStudyEntryId(cat.id, ev.start.getTime(), index),
            title: ev.title,
            location: ev.location,
            withLabel: null,
            note: ev.note,
            repeatRule: "NONE" as const,
            repeatUntilISO: null,
            eventParticipants: [],
            startISO: ev.start.toISOString(),
            endISO: ev.end.toISOString(),
            categoryId: cat.id,
            categoryColor: cat.color,
            categoryName: cat.name,
          }));
        } catch (e) {
          console.warn(`ICS subscription failed for category ${cat.id}:`, e);
          return [];
        }
      }),
    );

    return results.flat();
  };

  if (args.maxWaitMs == null || args.maxWaitMs <= 0) {
    return load();
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      load(),
      new Promise<SubscriptionStudyEntryShape[]>((resolve) => {
        timer = setTimeout(() => resolve([]), args.maxWaitMs);
      }),
    ]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}
