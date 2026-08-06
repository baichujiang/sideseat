import { unescapeIcsText, unfoldIcs } from "@/lib/calendar/ical-shared";
import ical, { type ParameterValue, type VEvent } from "node-ical";

export type ParsedIcsEvent = {
  start: Date;
  end: Date;
  title: string;
  location: string | null;
  note: string | null;
};

function splitPropertyLine(line: string): { name: string; params: string; value: string } | null {
  const colon = line.indexOf(":");
  if (colon === -1) return null;
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const semi = left.indexOf(";");
  if (semi === -1) {
    return { name: left.toUpperCase(), params: "", value };
  }
  return { name: left.slice(0, semi).toUpperCase(), params: left.slice(semi + 1), value };
}

function parseDateTime(params: string, raw: string): Date | null {
  const upperParams = params.toUpperCase();
  const v = raw.trim();
  if (upperParams.includes("VALUE=DATE") || /^\d{8}$/.test(v)) {
    if (v.length !== 8) return null;
    const y = Number(v.slice(0, 4));
    const m = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null;
    return new Date(Date.UTC(y, m, d, 0, 0, 0, 0));
  }
  if (/^\d{8}T\d{6}Z$/i.test(v)) {
    const y = Number(v.slice(0, 4));
    const mo = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    const H = Number(v.slice(9, 11));
    const M = Number(v.slice(11, 13));
    const S = Number(v.slice(13, 15));
    return new Date(Date.UTC(y, mo, d, H, M, S));
  }
  if (/^\d{8}T\d{6}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const mo = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    const H = Number(v.slice(9, 11));
    const M = Number(v.slice(11, 13));
    const S = Number(v.slice(13, 15));
    return new Date(y, mo, d, H, M, S);
  }
  if (/^\d{8}T\d{4}$/.test(v)) {
    const y = Number(v.slice(0, 4));
    const mo = Number(v.slice(4, 6)) - 1;
    const d = Number(v.slice(6, 8));
    const H = Number(v.slice(9, 11));
    const M = Number(v.slice(11, 13));
    return new Date(y, mo, d, H, M, 0);
  }
  return null;
}

function extractVeventBlocks(unfolded: string): string[] {
  const blocks: string[] = [];
  let cursor = 0;
  while (cursor < unfolded.length) {
    const start = unfolded.indexOf("BEGIN:VEVENT", cursor);
    if (start === -1) break;
    const end = unfolded.indexOf("END:VEVENT", start);
    if (end === -1) break;
    blocks.push(unfolded.slice(start + "BEGIN:VEVENT".length, end).trim());
    cursor = end + "END:VEVENT".length;
  }
  return blocks;
}

function blockHasRrule(block: string): boolean {
  return /(^|\n)RRULE[^:]*:/i.test(block);
}

function blockStatusCancelled(block: string): boolean {
  const m = block.match(/(^|\n)STATUS[^:]*:([^\n]+)/i);
  if (!m) return false;
  return m[2]!.trim().toUpperCase() === "CANCELLED";
}

/**
 * Parses VEVENTs from raw .ics text. Skips all-day-only, cancelled, and RRULE
 * events (recurring imports are not supported yet).
 */
export function parseIcsForImport(raw: string): { events: ParsedIcsEvent[]; skipped: number } {
  const unfolded = unfoldIcs(raw);
  const blocks = extractVeventBlocks(unfolded);
  const events: ParsedIcsEvent[] = [];
  let skipped = 0;

  for (const block of blocks) {
    if (blockStatusCancelled(block)) {
      skipped += 1;
      continue;
    }
    if (blockHasRrule(block)) {
      skipped += 1;
      continue;
    }

    let dtStartLine: string | null = null;
    let dtEndLine: string | null = null;
    let summary: string | null = null;
    let location: string | null = null;
    let description: string | null = null;

    for (const line of block.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const prop = splitPropertyLine(trimmed);
      if (!prop) continue;
      if (prop.name === "DTSTART") dtStartLine = trimmed;
      else if (prop.name === "DTEND") dtEndLine = trimmed;
      else if (prop.name === "SUMMARY") summary = unescapeIcsText(prop.value);
      else if (prop.name === "LOCATION") location = unescapeIcsText(prop.value);
      else if (prop.name === "DESCRIPTION") description = unescapeIcsText(prop.value);
    }

    if (!dtStartLine) {
      skipped += 1;
      continue;
    }

    const ds = splitPropertyLine(dtStartLine);
    if (!ds) {
      skipped += 1;
      continue;
    }
    const start = parseDateTime(ds.params, ds.value);
    if (!start) {
      skipped += 1;
      continue;
    }

    if (ds.params.toUpperCase().includes("VALUE=DATE")) {
      skipped += 1;
      continue;
    }

    let end: Date | null = null;
    if (dtEndLine) {
      const de = splitPropertyLine(dtEndLine);
      if (de) {
        end = parseDateTime(de.params, de.value);
      }
    }
    if (!end) {
      end = new Date(start.getTime() + 60 * 60 * 1000);
    }

    if (!(end > start)) {
      skipped += 1;
      continue;
    }

    const title = (summary ?? "Imported event").trim().slice(0, 120) || "Imported event";
    events.push({
      start,
      end,
      title,
      location: location?.trim() ? location.trim().slice(0, 120) : null,
      note: description?.trim() ? description.trim().slice(0, 500) : null,
    });
  }

  return { events, skipped };
}

const MAX_SUBSCRIPTION_EVENTS = 400;
const MAX_DURATION_MS_SUB = 48 * 60 * 60 * 1000;

function parameterText(value: ParameterValue | undefined): string | null {
  if (value == null) return null;
  return typeof value === "string" ? value : value.val;
}

function subscriptionText(value: ParameterValue | undefined, maxLength: number): string | null {
  const normalized = parameterText(value)?.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

/**
 * Parses VEVENTs for read-only subscription display. Recurrence expansion applies
 * RRULE, EXDATE and RECURRENCE-ID overrides while preserving source time zones.
 * All-day events remain unsupported by the timed schedule UI.
 */
export function parseIcsForSubscriptionWindow(
  raw: string,
  windowStart: Date,
  windowEnd: Date,
): { events: ParsedIcsEvent[]; skipped: number } {
  const parsed = ical.sync.parseICS(raw);
  const events: ParsedIcsEvent[] = [];
  let skipped = 0;

  for (const component of Object.values(parsed)) {
    if (!component || component.type !== "VEVENT") continue;
    const event = component as VEvent;
    if (event.status === "CANCELLED" || event.datetype === "date" || event.start.dateOnly) {
      skipped += 1;
      continue;
    }

    let instances;
    try {
      instances = ical.expandRecurringEvent(event, {
        from: windowStart,
        to: windowEnd,
        includeOverrides: true,
        excludeExdates: true,
        expandOngoing: true,
      });
    } catch {
      skipped += 1;
      continue;
    }

    let accepted = 0;
    for (const instance of instances) {
      if (events.length >= MAX_SUBSCRIPTION_EVENTS) break;
      if (instance.isFullDay || instance.event.status === "CANCELLED") continue;

      const start = new Date(instance.start);
      const end = new Date(instance.end);
      const duration = end.getTime() - start.getTime();
      if (
        !Number.isFinite(start.getTime()) ||
        !Number.isFinite(end.getTime()) ||
        duration <= 0 ||
        duration > MAX_DURATION_MS_SUB
      ) {
        continue;
      }

      events.push({
        start,
        end,
        title: subscriptionText(instance.summary, 120) ?? "Calendar event",
        location: subscriptionText(instance.event.location, 120),
        note: subscriptionText(instance.event.description, 500),
      });
      accepted += 1;
    }

    if (accepted === 0) skipped += 1;
    if (events.length >= MAX_SUBSCRIPTION_EVENTS) break;
  }

  events.sort((a, b) => a.start.getTime() - b.start.getTime());
  return { events, skipped };
}
