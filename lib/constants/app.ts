export const APP_NAME = "SideSeat";
export const SESSION_COOKIE_NAME = "sideseat_session";
export const SESSION_DURATION_DAYS = 14;
export const INVITATION_RATE_LIMIT_WINDOW_MINUTES = 30;
export const INVITATION_RATE_LIMIT_COUNT = 5;

export const protectedRoutes = [
  "/admin",
  "/home",
  "/onboarding",
  "/courses",
  "/discover",
  "/inbox",
  "/connections",
  "/profile",
  "/reports",
  "/settings",
];

export const authRoutes = ["/login", "/signup"];

export const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
