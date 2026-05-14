import { DEFAULT_SCHOOL } from "@/lib/constants/schools";

/** Display name derived from username (already normalized to lowercase). */
export function defaultNicknameFromUsername(username: string): string {
  const cleaned = username.replace(/[_-]+/g, " ").trim();
  if (cleaned.length < 2) {
    return "Student";
  }
  return cleaned.replace(/\b\w/g, (ch) => ch.toUpperCase());
}

/** Matches profileSchema / discover defaults so users can use the app immediately. */
export const SIGNUP_DEFAULT_PROFILE = {
  school: DEFAULT_SCHOOL,
} as const;
