export type ViewerCourseMatchIndex = { ids: Set<string>; codes: Set<string> };

export type EnrolledCourseForMatch = { id: string; code: string | null };

export function normalizeCourseCode(code: string | null | undefined): string | null {
  const t = code?.trim().toUpperCase().replace(/\s+/g, "");
  return t || null;
}

export function buildViewerCourseMatchIndex(
  enrolled: EnrolledCourseForMatch[],
): ViewerCourseMatchIndex {
  const ids = new Set(enrolled.map((e) => e.id));
  const codes = new Set<string>();
  for (const e of enrolled) {
    const n = normalizeCourseCode(e.code);
    if (n) codes.add(n);
  }
  return { ids, codes };
}

export function courseMatchesViewer(
  c: { id: string; code: string | null },
  idx: ViewerCourseMatchIndex,
): boolean {
  if (idx.ids.has(c.id)) return true;
  const n = normalizeCourseCode(c.code);
  return n != null && idx.codes.has(n);
}
