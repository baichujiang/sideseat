/**
 * LSF (QIS) semester keys embedded in browse URLs, e.g. `root120261=…` → `20261` = SoSe 2026.
 * Pattern: `{calendarYear}{termDigit}` where termDigit is `1` = Sommer, `2` = Winter.
 */

export function semesterLabelToLsfSemesterCode(label: string): string | null {
  const t = label.trim();
  const ss = /^SS\s+(\d{4})$/i.exec(t);
  if (ss) return `${ss[1]}1`;

  const ws = /^WS\s+(\d{4})\/(\d{2})$/i.exec(t);
  if (ws) {
    const startYear = ws[1];
    const endShort = ws[2];
    if (endShort !== String((Number(startYear) + 1) % 100).padStart(2, "0")) {
      return null;
    }
    return `${startYear}2`;
  }

  return null;
}

export function lsfSemesterCodeToSemesterLabel(code: string): string | null {
  const m = /^(\d{4})([12])$/.exec(code.trim());
  if (!m) return null;
  const year = Number(m[1]);
  const term = m[2];
  if (term === "1") return `SS ${year}`;
  if (term === "2") {
    const next = (year + 1) % 100;
    return `WS ${year}/${String(next).padStart(2, "0")}`;
  }
  return null;
}
