import type { Weekday } from "@prisma/client";

export type SessionBlock = {
  weekday: Weekday;
  startMinute: number;
  endMinute: number;
};

/**
 * Total weekly overlap in minutes between two sets of sessions.
 * Assumes every session repeats weekly. Intersection is computed per weekday
 * after merging each side's blocks, so a user listing the same time twice
 * isn't double-counted.
 */
export function weeklyOverlapMinutes(a: SessionBlock[], b: SessionBlock[]): number {
  if (!a.length || !b.length) return 0;

  const byDayA = groupAndMerge(a);
  const byDayB = groupAndMerge(b);

  let total = 0;
  for (const [day, blocksA] of byDayA) {
    const blocksB = byDayB.get(day);
    if (!blocksB) continue;
    for (const ba of blocksA) {
      for (const bb of blocksB) {
        const start = Math.max(ba[0], bb[0]);
        const end = Math.min(ba[1], bb[1]);
        if (end > start) total += end - start;
      }
    }
  }
  return total;
}

/** Group by weekday, sort, and merge overlapping blocks. */
function groupAndMerge(sessions: SessionBlock[]): Map<Weekday, [number, number][]> {
  const byDay = new Map<Weekday, [number, number][]>();
  for (const s of sessions) {
    if (s.endMinute <= s.startMinute) continue;
    const list = byDay.get(s.weekday) ?? [];
    list.push([s.startMinute, s.endMinute]);
    byDay.set(s.weekday, list);
  }
  for (const [day, blocks] of byDay) {
    blocks.sort((x, y) => x[0] - y[0]);
    const merged: [number, number][] = [];
    for (const block of blocks) {
      const last = merged[merged.length - 1];
      if (last && block[0] <= last[1]) {
        last[1] = Math.max(last[1], block[1]);
      } else {
        merged.push([block[0], block[1]]);
      }
    }
    byDay.set(day, merged);
  }
  return byDay;
}

export function formatOverlap(minutes: number): string {
  if (minutes <= 0) return "";
  if (minutes < 60) return `${minutes}m overlap`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins ? `${hours}h ${mins}m overlap` : `${hours}h overlap`;
}
