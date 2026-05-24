import { isValidCategoryHex } from "@/lib/calendar/category-visual";

/** Session buffer for structured calendar copy/cut (paste UI reads this key). */
export const CALENDAR_CLIPBOARD_SESSION_KEY = "classlink:calendarClipboard:v1";

/** Fired on `window` when the in-app calendar clipboard buffer changes. */
export const CALENDAR_CLIPBOARD_CHANGED_EVENT = "classlink:calendarClipboardChanged";

export type CalendarClipboardKind = "copy" | "cut";

export type CalendarClipboardSessionV1 = {
  v: 1;
  kind: CalendarClipboardKind;
  /** Plain text placed on the system clipboard — preview for the add-event banner. */
  summaryText: string;
  title?: string;
  startAt?: string;
  endAt?: string;
  location?: string | null;
  note?: string | null;
  categoryId?: string | null;
  withUserIds?: string[];
  /** `#RRGGBB` from the source block’s calendar category when valid. */
  categoryColor?: string;
};

export type CalendarClipboardBlockInput = {
  courseName: string;
  courseCode: string | null;
  startMinute: number;
  endMinute: number;
  location: string | null;
  note?: string | null;
  categoryId?: string | null;
  eventParticipants?: Array<{ userId: string | null; name: string }>;
  /** Resolved category hex from `UserCalendarCategory` / block styling, if any. */
  categoryColor?: string | null;
};

export function occurrenceAndMinutesToRange(
  occurrenceDate: Date,
  startMinute: number,
  endMinute: number,
): { startAt: Date; endAt: Date } {
  const midnight = new Date(occurrenceDate);
  midnight.setHours(0, 0, 0, 0);
  const start = new Date(midnight.getTime() + startMinute * 60_000);
  let end = new Date(midnight.getTime() + endMinute * 60_000);
  if (end.getTime() <= start.getTime()) {
    end = new Date(start.getTime() + 15 * 60_000);
  }
  return { startAt: start, endAt: end };
}

export function calendarTitleFromWeekBlock(block: CalendarClipboardBlockInput): string {
  const withCode = [block.courseCode, block.courseName].filter(Boolean).join(" ").trim();
  return withCode || block.courseName.trim() || "Event";
}

export function buildClipboardSessionFromBlock(
  block: CalendarClipboardBlockInput,
  occurrenceDate: Date,
  kind: CalendarClipboardKind,
  summaryText: string,
): CalendarClipboardSessionV1 {
  const { startAt, endAt } = occurrenceAndMinutesToRange(
    occurrenceDate,
    block.startMinute,
    block.endMinute,
  );
  const rawHex = block.categoryColor?.trim();
  const categoryColor =
    rawHex && isValidCategoryHex(rawHex) ? rawHex : undefined;
  const withUserIds = block.eventParticipants
    ?.map((p) => p.userId)
    .filter((id): id is string => Boolean(id));
  return {
    v: 1,
    kind,
    summaryText,
    title: calendarTitleFromWeekBlock(block),
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    location: block.location,
    note: block.note ?? null,
    categoryId: block.categoryId ?? null,
    ...(withUserIds?.length ? { withUserIds } : {}),
    ...(categoryColor ? { categoryColor } : {}),
  };
}

export function clipboardEventDurationMs(session: CalendarClipboardSessionV1): number {
  const startMs = session.startAt ? new Date(session.startAt).getTime() : NaN;
  const endMs = session.endAt ? new Date(session.endAt).getTime() : NaN;
  if (Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs) {
    return endMs - startMs;
  }
  return 60 * 60_000;
}

/** Place a pasted event at `slotStart` while preserving the copied duration. */
export function pasteRangeAtSlot(
  slotStart: Date,
  session: CalendarClipboardSessionV1,
): { start: Date; end: Date } {
  const durationMs = clipboardEventDurationMs(session);
  const start = slotStart;
  const end = new Date(start.getTime() + durationMs);
  return { start, end };
}

function notifyCalendarClipboardChanged(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(CALENDAR_CLIPBOARD_CHANGED_EVENT));
}

export function writeCalendarClipboardSession(data: CalendarClipboardSessionV1): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(CALENDAR_CLIPBOARD_SESSION_KEY, JSON.stringify(data));
    notifyCalendarClipboardChanged();
  } catch {
    /* quota / private mode */
  }
}

export function readCalendarClipboardSession(): CalendarClipboardSessionV1 | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(CALENDAR_CLIPBOARD_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    const o = parsed as Record<string, unknown>;
    if (o.v !== 1) return null;
    if (o.kind !== "copy" && o.kind !== "cut") return null;
    if (typeof o.summaryText !== "string") return null;
    const session: CalendarClipboardSessionV1 = {
      v: 1,
      kind: o.kind,
      summaryText: o.summaryText,
      title: typeof o.title === "string" ? o.title : undefined,
      startAt: typeof o.startAt === "string" ? o.startAt : undefined,
      endAt: typeof o.endAt === "string" ? o.endAt : undefined,
      location: typeof o.location === "string" || o.location === null ? (o.location as string | null) : undefined,
      note: typeof o.note === "string" || o.note === null ? (o.note as string | null) : undefined,
      categoryId:
        typeof o.categoryId === "string" || o.categoryId === null
          ? (o.categoryId as string | null)
          : undefined,
    };
    if (
      typeof o.categoryColor === "string" &&
      isValidCategoryHex(o.categoryColor)
    ) {
      session.categoryColor = o.categoryColor.trim();
    }
    if (Array.isArray(o.withUserIds)) {
      session.withUserIds = o.withUserIds.filter((id): id is string => typeof id === "string" && id.length > 0);
    }
    return session;
  } catch {
    return null;
  }
}

export function clearCalendarClipboardSession(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.removeItem(CALENDAR_CLIPBOARD_SESSION_KEY);
    notifyCalendarClipboardChanged();
  } catch {
    /* noop */
  }
}
