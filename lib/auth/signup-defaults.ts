import { UserGender } from "@prisma/client";

/** Display name derived from username (already normalized to lowercase). */
export function defaultNicknameFromUsername(username: string): string {
  const cleaned = username.replace(/[_-]+/g, " ").trim();
  if (cleaned.length < 2) {
    return "Student";
  }
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Privacy defaults only. Identity fields must come from the user. */
export const SIGNUP_DEFAULT_PROFILE = {
  school: null,
  studentStatus: null,
  degreeLevel: null,
  semester: null,
  graduationYear: null,
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
  onboardingComplete: false,
} as const;
