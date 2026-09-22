/** Minimal RFC 5545 helpers for SideSeat calendar export/import. */

import { formatInTimeZone } from "date-fns-tz";

import { SCHEDULE_DISPLAY_TZ } from "@/lib/calendar/schedule-berlin";

export function escapeIcsText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");
}

export function unescapeIcsText(value: string): string {
  return value
    .replace(/\\\\/g, "\\")
    .replace(/\\n/gi, "\n")
    .replace(/\\N/g, "\n")
    .replace(/\\;/g, ";")
    .replace(/\\,/g, ",");
}

/** Fold a single logical line to max 75 octets per physical line (UTF-8 safe). */
export function foldIcsLine(line: string): string {
  const encoder = new TextEncoder();
  const parts: string[] = [];
  let rest = line;
  while (rest.length > 0) {
    let cut = rest.length;
    while (cut > 0 && encoder.encode(rest.slice(0, cut)).length > 75) {
      cut -= 1;
    }
    if (cut === 0) cut = 1;
    parts.push(rest.slice(0, cut));
    rest = rest.slice(cut);
  }
  return parts.join("\r\n ");
}

export function unfoldIcs(raw: string): string {
  const normalized = raw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  return normalized.replace(/\n[\t ]/g, "");
}

export function formatIcsUtc(dt: Date): string {
  const y = dt.getUTCFullYear();
  const mo = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(dt.getUTCDate()).padStart(2, "0");
  const h = String(dt.getUTCHours()).padStart(2, "0");
  const mi = String(dt.getUTCMinutes()).padStart(2, "0");
  const s = String(dt.getUTCSeconds()).padStart(2, "0");
  return `${y}${mo}${d}T${h}${mi}${s}Z`;
}

export function formatIcsDate(dt: Date): string {
  return formatInTimeZone(dt, SCHEDULE_DISPLAY_TZ, "yyyyMMdd");
}

export function isBerlinAllDayRange(start: Date, end: Date): boolean {
  if (!(end > start)) return false;
  return (
    formatInTimeZone(start, SCHEDULE_DISPLAY_TZ, "HH:mm:ss.SSS") === "00:00:00.000" &&
    formatInTimeZone(end, SCHEDULE_DISPLAY_TZ, "HH:mm:ss.SSS") === "00:00:00.000" &&
    formatIcsDate(start) !== formatIcsDate(end)
  );
}

/** Floating local civil time (no Z) — used for recurring class wall-clock. */
export function formatIcsFloatingLocal(dt: Date): string {
  const y = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const h = String(dt.getHours()).padStart(2, "0");
  const mi = String(dt.getMinutes()).padStart(2, "0");
  const s = String(dt.getSeconds()).padStart(2, "0");
  return `${y}${mo}${d}T${h}${mi}${s}`;
}
