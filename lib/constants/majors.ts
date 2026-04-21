/**
 * Closed list of majors students can select. Kept intentionally short so it
 * stays easy to aggregate (e.g. "How many Informatics students joined this
 * week?") without the free-text chaos that comes from letting users type.
 */
export const TUM_MAJORS = [
  "Aerospace Engineering",
  "Architecture",
  "Biochemistry",
  "Biology",
  "Chemistry",
  "Civil Engineering",
  "Data Engineering & Analytics",
  "Economics",
  "Electrical Engineering",
  "Environmental Engineering",
  "Informatics",
  "Information Systems",
  "Life Sciences",
  "Management",
  "Mathematics",
  "Mechanical Engineering",
  "Medicine",
  "Physics",
  "Political Science",
  "Sport Science",
] as const;

export type TumMajor = (typeof TUM_MAJORS)[number];

export function isKnownMajor(value: string): value is TumMajor {
  return (TUM_MAJORS as readonly string[]).includes(value);
}

export const SEMESTER_OPTIONS = Array.from({ length: 14 }, (_, index) => index + 1);
