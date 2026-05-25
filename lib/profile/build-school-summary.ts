import type { DegreeLevel } from "@prisma/client";

import type { ProfileSchoolSummary } from "@/components/profile/profile-identity-sheets";
import { DEGREE_LEVEL_LABELS } from "@/lib/constants/majors";
import { DEFAULT_SCHOOL, normalizeSchoolCode, schoolOptions } from "@/lib/constants/schools";

/** School · major/degree · semester line inputs for profile headers. */
export function buildProfileSchoolSummary(input: {
  school: string | null;
  degreeLevel: string | null;
  major: string | null;
  semester: number | null;
}): ProfileSchoolSummary {
  const schoolCode = normalizeSchoolCode(input.school) ?? DEFAULT_SCHOOL;
  const schoolShort = schoolOptions.find((s) => s.value === schoolCode)?.shortLabel ?? schoolCode;
  const degreeLevel =
    input.degreeLevel != null && input.degreeLevel in DEGREE_LEVEL_LABELS
      ? (input.degreeLevel as DegreeLevel)
      : "BACHELOR";
  return {
    schoolShort,
    degreeLabel: DEGREE_LEVEL_LABELS[degreeLevel],
    major: input.major?.trim() ?? "",
    semester: input.semester ?? 1,
  };
}
