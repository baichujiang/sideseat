import type { DiscoverActivityErrorCode } from "@/lib/discover/discover-activity-state";

const MESSAGES: Record<DiscoverActivityErrorCode, string> = {
  AUTH_REQUIRED: "Sign in to continue.",
  ONBOARDING_REQUIRED: "Complete your profile to continue.",
  CROSS_SCHOOL: "You can only join activities at your school.",
  SELF_SIGNUP: "You cannot join your own activity.",
  NOT_BOOKABLE: "This activity is not open for sign-ups.",
  ALREADY_GOING: "You are already signed up.",
  NOT_GOING: "You are not signed up for this activity.",
  ORGANIZER_ONLY: "Only the organizer can do that.",
  CREATE_LIMIT: "You already have the maximum number of open activities.",
  BLOCKED: "You cannot interact with this organizer.",
};

export function discoverActivityErrorMessage(code: DiscoverActivityErrorCode): string {
  return MESSAGES[code];
}

export function discoverActivityErrorStatus(code: DiscoverActivityErrorCode): number {
  switch (code) {
    case "AUTH_REQUIRED":
      return 401;
    case "ONBOARDING_REQUIRED":
    case "CROSS_SCHOOL":
    case "ORGANIZER_ONLY":
    case "BLOCKED":
      return 403;
    case "SELF_SIGNUP":
      return 400;
    case "NOT_GOING":
      return 404;
    case "CREATE_LIMIT":
      return 429;
    case "NOT_BOOKABLE":
    case "ALREADY_GOING":
      return 409;
    default:
      return 400;
  }
}
