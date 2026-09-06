const OCCURRENCE_MARKER = "_occ_";

export function calendarOccurrenceId(seriesId: string, originalStartAt: Date): string {
  return `${seriesId}${OCCURRENCE_MARKER}${originalStartAt.getTime()}`;
}

export function parseCalendarOccurrenceId(value: string): {
  seriesId: string;
  originalStartAt: Date;
} | null {
  const markerIndex = value.lastIndexOf(OCCURRENCE_MARKER);
  if (markerIndex <= 0) return null;
  const seriesId = value.slice(0, markerIndex);
  const rawMilliseconds = value.slice(markerIndex + OCCURRENCE_MARKER.length);
  if (!/^-?\d+$/.test(rawMilliseconds)) return null;
  const originalStartAt = new Date(Number(rawMilliseconds));
  if (Number.isNaN(originalStartAt.getTime())) return null;
  return { seriesId, originalStartAt };
}
