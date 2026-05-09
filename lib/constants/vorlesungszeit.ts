import { endOfDay, parseISO, startOfDay } from "date-fns";

import { DEFAULT_SCHOOL, type SchoolCode, normalizeSchoolCode } from "@/lib/constants/schools";
import { getCurrentSemesterDateRange, getCurrentSemesterLabel } from "@/lib/constants/semester";

/**
 * Official lecture periods (Vorlesungszeit) for class recurrence on Home / course mirror / .ics.
 * Sources: TUM “Termine und Fristen” / Rundschreiben (update when new PDF is published).
 * LMU: table currently aligned with TUM-style Munich dates; replace with LMU-specific rows when available.
 */
const TUM_VORLESUNGSZEIT_BY_LABEL: Record<string, { start: string; end: string }> = {
  "WS 2024/25": { start: "2024-10-14", end: "2025-02-07" },
  "SS 2025": { start: "2025-04-23", end: "2025-07-25" },
  "WS 2025/26": { start: "2025-10-13", end: "2026-02-06" },
  "SS 2026": { start: "2026-04-13", end: "2026-07-17" },
  "WS 2026/27": { start: "2026-10-12", end: "2027-02-05" },
  "SS 2027": { start: "2027-04-12", end: "2027-07-16" },
};

const VORLESUNGSZEIT_BY_SCHOOL: Record<SchoolCode, Record<string, { start: string; end: string }>> = {
  TUM: TUM_VORLESUNGSZEIT_BY_LABEL,
  LMU: TUM_VORLESUNGSZEIT_BY_LABEL,
};

/**
 * When a semester label is not in the table yet, approximate Vorlesungszeit from the
 * calendar-semester bounds (narrower than full semester months).
 */
function vorlesungszeitHeuristic(
  label: string,
  semesterBounds: { start: Date; end: Date },
): { start: Date; end: Date } {
  const ss = /^SS (\d{4})$/.exec(label);
  if (ss) {
    const y = Number(ss[1]);
    return {
      start: startOfDay(new Date(y, 3, 15)),
      end: endOfDay(new Date(y, 6, 25)),
    };
  }

  const ws = /^WS (\d{4})\/\d{2}$/.exec(label);
  if (ws) {
    const octYear = Number(ws[1]);
    return {
      start: startOfDay(new Date(octYear, 9, 14)),
      end: endOfDay(new Date(octYear + 1, 1, 7)),
    };
  }

  return semesterBounds;
}

/**
 * Date range for **recurring course sessions** (weekly blocks) and related exports.
 * Uses school Vorlesungszeit when known; otherwise semantic semester months, then heuristic.
 */
export function getClassScheduleDateRange(opts: {
  school?: string | null;
  now?: Date;
}): { start: Date; end: Date } {
  const now = opts.now ?? new Date();
  const school = normalizeSchoolCode(opts.school) ?? DEFAULT_SCHOOL;
  const label = getCurrentSemesterLabel(now);
  const semesterBounds = getCurrentSemesterDateRange(now);

  const table = VORLESUNGSZEIT_BY_SCHOOL[school] ?? VORLESUNGSZEIT_BY_SCHOOL[DEFAULT_SCHOOL];
  const hit = table[label];
  if (hit) {
    return {
      start: startOfDay(parseISO(hit.start)),
      end: endOfDay(parseISO(hit.end)),
    };
  }

  return vorlesungszeitHeuristic(label, semesterBounds);
}
