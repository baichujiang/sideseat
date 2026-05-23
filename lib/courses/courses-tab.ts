import type { Route } from "next";

import type { SchoolCode } from "@/lib/constants/schools";

export type CoursesTab = "popular-courses" | "my-courses" | "my-bookmarked-courses";

export const COURSES_TAB_OPTIONS: CoursesTab[] = [
  "popular-courses",
  "my-courses",
  "my-bookmarked-courses",
];

export const DEFAULT_COURSES_TAB: CoursesTab = "popular-courses";

const COURSES_TAB_SESSION_KEY = "sideseat:courses-tab";

export function normalizeCoursesTab(raw?: string | null): CoursesTab {
  return COURSES_TAB_OPTIONS.includes(raw as CoursesTab) ? (raw as CoursesTab) : DEFAULT_COURSES_TAB;
}

export function coursesTabHref(tab: CoursesTab, school: SchoolCode, q?: string): Route {
  const params = new URLSearchParams({ school, tab });
  if (q && q.trim()) params.set("q", q.trim());
  return `/courses?${params.toString()}` as Route;
}

/** Full `/courses` list path for `?returnTo=` (includes active tab + school). */
export function coursesListReturnPath(tab: CoursesTab, school: SchoolCode, q?: string): string {
  return coursesTabHref(tab, school, q);
}

export function readStoredCoursesTab(): CoursesTab {
  if (typeof sessionStorage === "undefined") return DEFAULT_COURSES_TAB;
  try {
    const raw = sessionStorage.getItem(COURSES_TAB_SESSION_KEY);
    return normalizeCoursesTab(raw);
  } catch {
    return DEFAULT_COURSES_TAB;
  }
}

export function writeStoredCoursesTab(tab: CoursesTab): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(COURSES_TAB_SESSION_KEY, tab);
  } catch {
    /* ignore quota / private mode */
  }
}

/** Bottom-nav target: last tab the user had open on `/courses`. */
export function coursesNavHrefFromStorage(school?: SchoolCode): Route {
  const tab = readStoredCoursesTab();
  const params = new URLSearchParams({ tab });
  if (school) params.set("school", school);
  return `/courses?${params.toString()}` as Route;
}
