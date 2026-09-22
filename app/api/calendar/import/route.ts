import { requireOnboardedUser } from "@/lib/auth/guards";
import {
  CalendarIcsImportError,
  MAX_ICS_IMPORT_BYTES,
  persistCalendarIcsImport,
  prepareCalendarIcsImport,
} from "@/lib/calendar/import-ics-events";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return error("Choose an .ics file to import.");
    }

    if (file.size > MAX_ICS_IMPORT_BYTES) {
      return error("File is too large. Max 512 KB.");
    }

    const raw = await file.text();
    const prepared = prepareCalendarIcsImport(raw);
    const result = await prisma.$transaction((tx) => persistCalendarIcsImport(tx, user.id, prepared));
    return ok(result);
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
    if (cause instanceof CalendarIcsImportError) {
      return error(cause.message);
    }
    console.error(cause);
    return error("Could not import calendar.");
  }
}
