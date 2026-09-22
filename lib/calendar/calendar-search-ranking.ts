export type CalendarSearchableFields = {
  title: string;
  location: string | null;
  note: string | null;
};

export type CalendarSearchSortKey = {
  rank: number;
  distance: number;
  pastPriority: number;
  startISO: string;
  id: string;
};

function normalized(value: string) {
  return value.trim().toLocaleLowerCase();
}

/** Lower is better. Matching stays intentionally literal; this is not fuzzy/AI search. */
export function calendarSearchMatchRank(
  entry: CalendarSearchableFields,
  query: string,
): number | null {
  const needle = normalized(query);
  if (!needle) return null;
  const title = normalized(entry.title);
  if (title === needle) return 0;
  if (title.startsWith(needle)) return 1;
  if (title.includes(needle)) return 2;
  if (entry.location && normalized(entry.location).includes(needle)) return 3;
  if (entry.note && normalized(entry.note).includes(needle)) return 4;
  return null;
}

export function compareCalendarSearchSortKeys(
  left: CalendarSearchSortKey,
  right: CalendarSearchSortKey,
) {
  if (left.rank !== right.rank) return left.rank - right.rank;
  if (left.distance !== right.distance) return left.distance - right.distance;
  if (left.pastPriority !== right.pastPriority) {
    return left.pastPriority - right.pastPriority;
  }
  const time = left.startISO.localeCompare(right.startISO);
  return time !== 0 ? time : left.id.localeCompare(right.id);
}
