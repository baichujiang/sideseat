// TUM academic calendar convention:
// - Summer Semester (SS):  April 1 – September 30  →  "SS 2026"
// - Winter Semester (WS):  October 1 – March 31   →  "WS 2026/27" (spans 2 calendar years)
//
// We derive the current semester from the server clock so users never have to
// type it. If TUM changes the boundary months, tweak the ranges here.
//
// **Recurring class sessions** on Home / course mirror / .ics use **Vorlesungszeit**
// (lecture period), not these full semester months — see `lib/constants/vorlesungszeit.ts`.

export function getCurrentSemesterLabel(now: Date = new Date()): string {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (month >= 4 && month <= 9) {
    return `SS ${year}`;
  }
  if (month >= 10) {
    const next = (year + 1) % 100;
    return `WS ${year}/${next.toString().padStart(2, "0")}`;
  }
  // Jan – Mar: still the winter semester that started last October
  const thisYear = year % 100;
  return `WS ${year - 1}/${thisYear.toString().padStart(2, "0")}`;
}

export function getCurrentSemesterDateRange(now: Date = new Date()): {
  start: Date;
  end: Date;
} {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  if (month >= 4 && month <= 9) {
    return {
      start: new Date(year, 3, 1, 0, 0, 0, 0),
      end: new Date(year, 8, 30, 23, 59, 59, 999),
    };
  }
  if (month >= 10) {
    return {
      start: new Date(year, 9, 1, 0, 0, 0, 0),
      end: new Date(year + 1, 2, 31, 23, 59, 59, 999),
    };
  }
  return {
    start: new Date(year - 1, 9, 1, 0, 0, 0, 0),
    end: new Date(year, 2, 31, 23, 59, 59, 999),
  };
}
