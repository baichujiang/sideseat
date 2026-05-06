import { requireOnboardedUser } from "@/lib/auth/guards";
import { parseIcsForImport } from "@/lib/calendar/ical-import-parse";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

const MAX_FILE_BYTES = 512 * 1024;
const MAX_IMPORT_EVENTS = 200;
const MIN_START = () => Date.now() - 10 * 365 * 24 * 60 * 60 * 1000;
const MAX_START = () => Date.now() + 4 * 365 * 24 * 60 * 60 * 1000;
const MAX_DURATION_MS = 48 * 60 * 60 * 1000;

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return error("Choose an .ics file to import.");
    }

    if (file.size === 0) {
      return error("The file is empty.");
    }

    if (file.size > MAX_FILE_BYTES) {
      return error("File is too large. Max 512 KB.");
    }

    const raw = await file.text();
    if (!/BEGIN:VCALENDAR/i.test(raw)) {
      return error("This file does not look like a valid iCalendar (.ics) export.");
    }
    const { events, skipped: parseSkipped } = parseIcsForImport(raw);

    if (events.length === 0) {
      return error(
        parseSkipped > 0
          ? "No importable events found (skipped all-day, recurring, or cancelled items)."
          : "No events found in this file.",
      );
    }

    const tMin = MIN_START();
    const tMax = MAX_START();
    let skipped = parseSkipped;
    const toCreate = events.filter((ev) => {
      const dur = ev.end.getTime() - ev.start.getTime();
      if (dur <= 0 || dur > MAX_DURATION_MS) {
        skipped += 1;
        return false;
      }
      const t = ev.start.getTime();
      if (t < tMin || t > tMax) {
        skipped += 1;
        return false;
      }
      return true;
    });

    const slice = toCreate.slice(0, MAX_IMPORT_EVENTS);
    if (toCreate.length > MAX_IMPORT_EVENTS) {
      skipped += toCreate.length - MAX_IMPORT_EVENTS;
    }

    if (slice.length === 0) {
      return error(
        skipped > 0
          ? "No importable events (wrong date range, too long, or skipped all-day/recurring/cancelled items)."
          : "No importable events in this file.",
      );
    }

    const created = await prisma.$transaction(async (tx) => {
      let n = 0;
      for (const ev of slice) {
        await tx.calendarEntry.create({
          data: {
            userId: user.id,
            title: ev.title,
            location: ev.location,
            note: ev.note,
            source: "ical",
            startAt: ev.start,
            endAt: ev.end,
            repeatRule: "NONE",
            repeatUntil: null,
          },
        });
        n += 1;
      }
      return n;
    });

    return ok({ imported: created, skipped });
  } catch (cause) {
    if (
      typeof cause === "object" &&
      cause !== null &&
      "digest" in cause &&
      typeof (cause as { digest?: unknown }).digest === "string" &&
      String((cause as { digest: string }).digest).startsWith("NEXT_REDIRECT")
    ) {
      throw cause;
    }
    console.error(cause);
    return error("Could not import calendar.");
  }
}
