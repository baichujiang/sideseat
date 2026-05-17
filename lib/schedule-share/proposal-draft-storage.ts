const STORAGE_KEY = "classlink.schedule-share.proposal-draft";

export type ScheduleShareProposalDraft = {
  token: string;
  title: string;
  note: string;
  location: string;
  startTime: string;
  endTime: string;
  boundsStart: string;
  boundsEnd: string;
};

export function saveScheduleShareProposalDraft(draft: ScheduleShareProposalDraft): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota / private mode */
  }
}

export function loadScheduleShareProposalDraft(token: string): ScheduleShareProposalDraft | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ScheduleShareProposalDraft;
    if (parsed.token !== token) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearScheduleShareProposalDraft(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
