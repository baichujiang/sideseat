import { DegreeLevel, LanguageProficiency, LanguageTag, UserGender } from "@prisma/client";

import { DEFAULT_SCHOOL } from "@/lib/constants/schools";

/** Display name derived from username (already normalized to lowercase). */
export function defaultNicknameFromUsername(username: string): string {
  const cleaned = username.replace(/[_-]+/g, " ").trim();
  if (cleaned.length < 2) {
    return "Student";
  }
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Profile defaults applied at signup so users can use the app without a setup step. */
export const SIGNUP_DEFAULT_PROFILE = {
  school: DEFAULT_SCHOOL,
  degreeLevel: DegreeLevel.BACHELOR,
  semester: 1,
  major: null,
  gender: UserGender.PRIVATE,
  discoverByCourse: true,
  discoverByMajor: true,
  discoverBySemester: true,
  allowInvitationNotes: true,
  contactInfoOptIn: false,
  hideFromCourseMembers: false,
  hideFromDiscovery: false,
  hideFromRecommendations: false,
  onboardingComplete: true,
} as const;

export function signupDefaultUserLanguages() {
  return {
    create: [{ tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT }],
  };
}
