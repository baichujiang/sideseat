import { endOfDay, parseISO, startOfDay } from "date-fns";

import { type SchoolCode, normalizeSchoolCode } from "@/lib/constants/schools";
import { getCurrentSemesterDateRange, getCurrentSemesterLabel } from "@/lib/constants/semester";

/**
 * Published lecture periods used by course recurrence and calendar export.
 * Keep these school-specific tables explicit so an unknown future semester is
 * never silently presented as an official date.
 *
 * TUM: https://www.tum.de/studium/bewerbung/infoportal-bewerbung/termine-und-fristen
 * LMU: https://www.lmu.de/de/workspace-fuer-studierende/1x1-des-studiums/vorlesungszeiten/
 */
const TUM_VORLESUNGSZEIT_BY_LABEL: Record<string, { start: string; end: string }> = {
  "WS 2024/25": { start: "2024-10-14", end: "2025-02-07" },
  "SS 2025": { start: "2025-04-23", end: "2025-07-25" },
  "WS 2025/26": { start: "2025-10-13", end: "2026-02-06" },
  "SS 2026": { start: "2026-04-13", end: "2026-07-17" },
  "WS 2026/27": { start: "2026-10-12", end: "2027-02-05" },
  "SS 2027": { start: "2027-04-12", end: "2027-07-16" },
  "WS 2027/28": { start: "2027-10-18", end: "2028-02-11" },
};

const LMU_VORLESUNGSZEIT_BY_LABEL: Record<string, { start: string; end: string }> = {
  "WS 2024/25": { start: "2024-10-14", end: "2025-02-07" },
  "SS 2025": { start: "2025-04-23", end: "2025-07-25" },
  "WS 2025/26": { start: "2025-10-13", end: "2026-02-06" },
  "SS 2026": { start: "2026-04-13", end: "2026-07-17" },
  "WS 2026/27": { start: "2026-10-12", end: "2027-02-05" },
  "SS 2027": { start: "2027-04-12", end: "2027-07-16" },
  "WS 2027/28": { start: "2027-10-18", end: "2028-02-11" },
};

const VORLESUNGSZEIT_BY_SCHOOL: Record<SchoolCode, Record<string, { start: string; end: string }>> = {
  TUM: TUM_VORLESUNGSZEIT_BY_LABEL,
  LMU: LMU_VORLESUNGSZEIT_BY_LABEL,
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

  const ws = /^WS (\d{4})(?:\/\d{2,4})?$/.exec(label);
  if (ws) {
    const octYear = Number(ws[1]);
    return {
      start: startOfDay(new Date(octYear, 9, 14)),
      end: endOfDay(new Date(octYear + 1, 1, 7)),
    };
  }

  return semesterBounds;
}

function semesterBoundsForLabel(
  semesterLabel: string,
): { start: Date; end: Date } | null {
  const label = semesterLabel.trim().toUpperCase();
  const summer = /^SS\s+(\d{4})$/.exec(label);
  if (summer) {
    const year = Number(summer[1]);
    return {
      start: startOfDay(new Date(year, 3, 1)),
      end: endOfDay(new Date(year, 8, 30)),
    };
  }

  const winter = /^WS\s+(\d{4})(?:\/(\d{2}|\d{4}))?$/.exec(label);
  if (winter) {
    const year = Number(winter[1]);
    const suffix = winter[2];
    if (
      suffix &&
      suffix !== String(year + 1) &&
      suffix !== String(year + 1).slice(-2)
    ) {
      return null;
    }
    return {
      start: startOfDay(new Date(year, 9, 1)),
      end: endOfDay(new Date(year + 1, 2, 31)),
    };
  }

  return null;
}

/** Published lecture period for one catalog semester, or null when unknown. */
export function getOfficialClassScheduleDateRangeForSemester(opts: {
  school?: string | null;
  semesterLabel: string;
}): { start: Date; end: Date } | null {
  const label = opts.semesterLabel.trim().toUpperCase();
  const school = normalizeSchoolCode(opts.school);
  if (!school) return null;
  const table = VORLESUNGSZEIT_BY_SCHOOL[school];
  const hit = table[label];
  if (!hit) return null;
  return {
    start: startOfDay(parseISO(hit.start)),
    end: endOfDay(parseISO(hit.end)),
  };
}

/**
 * Course UI fallback for a valid semester label. Calendar exports deliberately
 * use `getOfficialClassScheduleDateRangeForSemester` instead, so a private feed
 * never invents course dates for an unconfigured future or historical term.
 */
export function getClassScheduleDateRangeForSemester(opts: {
  school?: string | null;
  semesterLabel: string;
}): { start: Date; end: Date } | null {
  const official = getOfficialClassScheduleDateRangeForSemester(opts);
  if (official) return official;

  const label = opts.semesterLabel.trim().toUpperCase();
  const semesterBounds = semesterBoundsForLabel(label);
  if (!semesterBounds) return null;
  return vorlesungszeitHeuristic(label, semesterBounds);
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
  const label = getCurrentSemesterLabel(now);
  const semesterBounds = getCurrentSemesterDateRange(now);
  return (
    getClassScheduleDateRangeForSemester({
      school: opts.school,
      semesterLabel: label,
    }) ?? vorlesungszeitHeuristic(label, semesterBounds)
  );
}
