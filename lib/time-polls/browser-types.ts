import type { PollSlot, PollWindow } from "@/lib/time-polls/domain";
export const POLL_LOCALE_COOKIE = "SIDESEAT_POLL_LOCALE";
export type PollActivitySelection = {
  topic: string; isOpen: boolean; selectedIdeaId: string | null; ideaCount: number; hasParticipated: boolean;
  ideas: { id: string; title: string; location: string | null; authorName: string; isMine: boolean;
    interestedBy: { displayName: string; isMe: boolean }[] }[];
};
export type SharedTimePoll = {
  token: string; title: string; timeZone: string; dates: string[]; slots: PollSlot[];
  participants: { id: string; displayName: string; slotIds: number[]; isMe: boolean; isGuest: boolean }[];
  invitations: { id: string; displayName: string; status: string; selected: boolean; isMe: boolean; isGuest: boolean }[];
  mySlotIds: number[]; myDisplayName: string; didRespond: boolean; viewerId: string | null;
  legacyGuestNeedsRecovery?: boolean;
  location: string | null; durationMinutes: number | null; expectedCount: number | null;
  expiresAt?: string | null; planningMode: string; phase: string; invitationVersion: number; chosenStart: string | null; chosenEnd: string | null;
  summary: { counts: number[]; participantCount: number; maximum: number; common: boolean; windows: PollWindow[] };
  activitySelection?: PollActivitySelection | null;
};
export type AvailabilityCell = PollSlot & { slotIds: number[] };
// Keep persisted 15-minute IDs intact, including a legacy trailing quarter-hour.
export function availabilityCells(slots: PollSlot[]): AvailabilityCell[] {
  const cells: AvailabilityCell[] = [];
  for (let index = 0; index < slots.length; index++) {
    const first = slots[index], next = slots[index + 1];
    if (next && next.date === first.date && first.end === next.start) {
      cells.push({ ...first, end: next.end, slotIds: [first.id, next.id] });
      index++;
    } else cells.push({ ...first, slotIds: [first.id] });
  }
  return cells;
}
export function selectedRanges(poll: SharedTimePoll, selected: number[]) {
  const ids = new Set(selected);
  const ranges: { date: string; start: string; end: string; ids: number[] }[] = [];
  for (const slot of poll.slots) {
    if (!ids.has(slot.id)) continue;
    const last = ranges.at(-1);
    if (last && last.date === slot.date && last.end === slot.start) { last.end = slot.end; last.ids.push(slot.id); }
    else ranges.push({ date: slot.date, start: slot.start, end: slot.end, ids: [slot.id] });
  }
  return ranges;
}
export function pollClock(instant: string, zone: string) { return new Intl.DateTimeFormat("en-GB", { timeZone: zone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(instant)); }
export function pollDate(date: string, zh: boolean) { return new Intl.DateTimeFormat(zh ? "zh-CN" : "en-GB", { timeZone: "UTC", month: "short", day: "numeric", weekday: "short" }).format(new Date(date + "T12:00:00Z")); }


export type InvitationTimetableRow = { start: string; end: string; date: string; label: string; from: number; through: number };
// Display-only half-hour context. It never rewrites saved availability or invitation instants.
export function invitationTimetableRows(start: string, end: string, timeZone: string): InvitationTimetableRow[] {
  const first = Date.parse(start), last = Date.parse(end);
  if (!(last > first)) return [];
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const date = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" });
  const offset = new Intl.DateTimeFormat("en-GB", { timeZone, timeZoneName: "longOffset" });
  const floorHalfHour = (instant: number) => {
    const parts = clock.formatToParts(instant);
    return instant - (Number(parts.find(p => p.type === "minute")!.value) % 30 * 60 + Number(parts.find(p => p.type === "second")!.value)) * 1000 - instant % 1000;
  };
  const endFloor = floorHalfHour(last), limit = (endFloor < last ? endFloor + 1800000 : endFloor) + 1800000;
  const rows: InvitationTimetableRow[] = [], occurrences = new Map<string, number>();
  for (let cursor = floorHalfHour(first) - 1800000; cursor < limit; cursor += 1800000) {
    const day = date.format(cursor), label = pollClock(new Date(cursor).toISOString(), timeZone), key = day + label;
    const repeated = occurrences.get(key) ?? 0; occurrences.set(key, repeated + 1);
    const zone = repeated ? " " + offset.formatToParts(cursor).find(p => p.type === "timeZoneName")!.value.replace("GMT", "") : "";
    rows.push({ start: new Date(cursor).toISOString(), end: new Date(cursor + 1800000).toISOString(), date: day, label: label + zone,
      from: Math.max(0, Math.min(1, (first - cursor) / 1800000)), through: Math.max(0, Math.min(1, (last - cursor) / 1800000)) });
  }
  const days = new Set(rows.filter(row => row.through > row.from).map(row => row.date));
  return rows.filter(row => days.has(row.date));
}
