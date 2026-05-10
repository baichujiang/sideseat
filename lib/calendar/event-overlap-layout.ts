type TimeboxedItem = {
  id: string;
  startMinute: number;
  endMinute: number;
};

export type EventOverlapLayout = {
  columnIndex: number;
  columnCount: number;
  stackDepth: number;
  hasShortOverlap: boolean;
};

export const STRONG_OVERLAP_MINUTES = 30;

/**
 * When overlap ≤ {@link STRONG_OVERLAP_MINUTES}, cards stack in one column — use glass so the rear block stays visible.
 * Apply after tone `card` / category fill so tailwind-merge replaces opaque backgrounds.
 */
export const SCHEDULE_SHORT_OVERLAP_GLASS =
  "border-black/12 bg-white/38 backdrop-blur-md backdrop-saturate-150 shadow-[0_8px_22px_-10px_rgba(15,23,42,0.2)] dark:border-white/14 dark:bg-zinc-950/44 dark:shadow-[0_8px_26px_-12px_rgba(0,0,0,0.55)]";

function overlapMinutes(a: TimeboxedItem, b: TimeboxedItem) {
  return Math.max(0, Math.min(a.endMinute, b.endMinute) - Math.max(a.startMinute, b.startMinute));
}

function isStrongOverlap(a: TimeboxedItem, b: TimeboxedItem) {
  return overlapMinutes(a, b) > STRONG_OVERLAP_MINUTES;
}

function isShortOverlap(a: TimeboxedItem, b: TimeboxedItem) {
  const overlap = overlapMinutes(a, b);
  return overlap > 0 && overlap <= STRONG_OVERLAP_MINUTES;
}

export function computeEventOverlapLayout<T extends TimeboxedItem>(
  items: T[],
): Array<T & EventOverlapLayout> {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => {
    if (a.startMinute !== b.startMinute) return a.startMinute - b.startMinute;
    if (a.endMinute !== b.endMinute) return a.endMinute - b.endMinute;
    return a.id.localeCompare(b.id);
  });

  const clusters: T[][] = [];
  let currentCluster: T[] = [];
  let clusterEnd = -1;

  for (const item of sorted) {
    if (currentCluster.length === 0 || item.startMinute < clusterEnd) {
      currentCluster.push(item);
      clusterEnd = Math.max(clusterEnd, item.endMinute);
      continue;
    }
    clusters.push(currentCluster);
    currentCluster = [item];
    clusterEnd = item.endMinute;
  }

  if (currentCluster.length > 0) clusters.push(currentCluster);

  return clusters.flatMap((cluster) => {
    const columnItems: T[][] = [];
    const byId = new Map<string, T & EventOverlapLayout>();

    for (const item of cluster) {
      let columnIndex = columnItems.findIndex((column) => column.every((other) => !isStrongOverlap(other, item)));
      if (columnIndex === -1) {
        columnIndex = columnItems.length;
        columnItems.push([]);
      }

      const sameColumn = columnItems[columnIndex];
      const stackDepth = sameColumn.filter((other) => isShortOverlap(other, item)).length;
      const hasShortOverlap =
        stackDepth > 0 || sameColumn.some((other) => isShortOverlap(other, item));

      sameColumn.push(item);
      byId.set(item.id, {
        ...item,
        columnIndex,
        columnCount: 0,
        stackDepth,
        hasShortOverlap,
      });
    }

    const columnCount = Math.max(columnItems.length, 1);
    return cluster.map((item) => {
      const positioned = byId.get(item.id)!;
      return {
        ...positioned,
        columnCount,
      };
    });
  });
}
