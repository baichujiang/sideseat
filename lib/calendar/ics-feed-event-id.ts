/** Synthetic calendar entry ids for ICS subscription events (not stored in DB). */
export const ICS_FEED_ENTRY_ID_PREFIX = "icsfeed:";

export function isIcsFeedStudyEntryId(id: string): boolean {
  return id.startsWith(ICS_FEED_ENTRY_ID_PREFIX);
}

export function makeIcsFeedStudyEntryId(categoryId: string, startMs: number, index: number): string {
  return `${ICS_FEED_ENTRY_ID_PREFIX}${categoryId}:${startMs}:${index}`;
}
