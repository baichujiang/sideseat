import { normalizeSchoolCode } from "@/lib/constants/schools";

export type NativeMVPReadinessInput = Readonly<{
  school: string | null;
  studentStatus: string | null;
  verifiedStudent: boolean;
  studentVerificationStatus: string;
  languageCount: number;
}>;

export type NativeMVPReadiness = Readonly<{
  campusIdentityComplete: boolean;
  languagesComplete: boolean;
  verificationState: string;
  ready: boolean;
}>;

export function deriveNativeMVPReadiness(
  input: NativeMVPReadinessInput,
): NativeMVPReadiness {
  const campusIdentityComplete =
    normalizeSchoolCode(input.school) !== null &&
    Boolean(input.studentStatus?.trim());
  const languagesComplete = input.languageCount > 0;
  const verificationState = input.studentVerificationStatus;
  const verificationComplete =
    input.verifiedStudent && verificationState === "VERIFIED";

  return {
    campusIdentityComplete,
    languagesComplete,
    verificationState,
    ready:
      campusIdentityComplete && languagesComplete && verificationComplete,
  };
}
