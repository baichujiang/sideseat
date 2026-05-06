/**
 * Canonical school list for filtering (e.g. /courses). Add an entry here and
 * it appears in `schoolOptions` and the courses school `<select>` automatically.
 */
export const schoolDirectory = {
  TUM: {
    label: "Technical University of Munich",
    shortLabel: "TUM",
    verificationDomains: ["tum.de", "mytum.de"],
  },
  LMU: {
    label: "Ludwig Maximilian University of Munich",
    shortLabel: "LMU",
    verificationDomains: ["lmu.de"],
  },
} as const;

export type SchoolCode = keyof typeof schoolDirectory;

/** Static logos under `/public/schools/` — replace with official assets if needed. */
const SCHOOL_LOGO_PATH: Record<SchoolCode, string> = {
  TUM: "/schools/tum.svg",
  LMU: "/schools/lmu.svg",
};

/** Default scope when no school is in the URL or profile. */
export const DEFAULT_SCHOOL: SchoolCode = "TUM";

export const schoolOptions = Object.entries(schoolDirectory).map(([value, school]) => ({
  value: value as SchoolCode,
  label: school.label,
  shortLabel: school.shortLabel,
}));

export function normalizeSchoolCode(code?: string | null): SchoolCode | null {
  if (!code) {
    return null;
  }

  if (schoolDirectory[code as SchoolCode]) {
    return code as SchoolCode;
  }

  const matched = schoolOptions.find(
    (school) => school.label === code || school.shortLabel === code,
  );

  return matched?.value ?? null;
}

/** Public URL path for the school wordmark/logo, or null if none. */
export function getSchoolLogoPath(code?: string | null): string | null {
  const normalized = normalizeSchoolCode(code);
  if (!normalized) {
    return null;
  }
  return SCHOOL_LOGO_PATH[normalized] ?? null;
}

export function getSchoolByCode(code?: string | null) {
  const normalizedCode = normalizeSchoolCode(code);

  if (!normalizedCode) {
    return null;
  }

  return schoolDirectory[normalizedCode];
}

export function getSchoolLabel(code?: string | null) {
  return getSchoolByCode(code)?.label ?? code ?? "";
}

export function getSchoolMatchValues(code?: string | null) {
  const normalizedCode = normalizeSchoolCode(code);

  if (!normalizedCode) {
    return code ? [code] : [];
  }

  const school = schoolDirectory[normalizedCode];
  return Array.from(new Set([normalizedCode, school.label, school.shortLabel]));
}
