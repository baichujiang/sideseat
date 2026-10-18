import type { PollSlot, PollWindow } from "@/lib/time-polls/domain";
export const POLL_LOCALE_COOKIE = "SIDESEAT_POLL_LOCALE";
export type SharedTimePoll = {
  token: string; title: string; timeZone: string; dates: string[]; slots: PollSlot[];
  participants: { id: string; displayName: string; slotIds: number[]; isMe: boolean; isGuest: boolean }[];
  invitations: { id: string; displayName: string; status: string; selected: boolean; isMe: boolean; isGuest: boolean }[];
  mySlotIds: number[]; myDisplayName: string; didRespond: boolean; viewerId: string | null;
  location: string | null; durationMinutes: number | null; expectedCount: number | null;
  expiresAt?: string | null; planningMode: string; phase: string; invitationVersion: number; chosenStart: string | null; chosenEnd: string | null;
  summary: { counts: number[]; participantCount: number; maximum: number; common: boolean; windows: PollWindow[] };
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
