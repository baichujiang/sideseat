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

/** The one supported school right now. Use this when a default is needed. */
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
