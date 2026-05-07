export const APP_NAME = "SideSeat";

/** HttpOnly refresh token cookie. Legacy `sideseat_session` is still read for migration. */
export const REFRESH_COOKIE_NAME = "sideseat_refresh";
/** @deprecated Use {@link REFRESH_COOKIE_NAME}; kept for one-sided read migration. */
export const LEGACY_SESSION_COOKIE_NAME = "sideseat_session";

/** Refresh session row TTL (days). */
export const REFRESH_TOKEN_TTL_DAYS = 30;
/** Short-lived JWT for API / Authorization header (minutes). */
export const ACCESS_TOKEN_TTL_MINUTES = 45;

/** @deprecated Use {@link REFRESH_COOKIE_NAME} */
export const SESSION_COOKIE_NAME = LEGACY_SESSION_COOKIE_NAME;
/** @deprecated Use {@link REFRESH_TOKEN_TTL_DAYS} */
export const SESSION_DURATION_DAYS = REFRESH_TOKEN_TTL_DAYS;
/**
 * Abuse rate limit for the first-message flow: a single user can open at most
 * NEW_THREAD_RATE_LIMIT_COUNT brand-new 1:1 threads per window. Existing
 * threads (an ACTIVE Connection already exists) are unrelated and not counted.
 */
export const NEW_THREAD_RATE_LIMIT_WINDOW_MINUTES = 60;
export const NEW_THREAD_RATE_LIMIT_COUNT = 10;

/**
 * Contact exchange cooldown: after a contact-exchange request is declined or
 * canceled, the other side has to wait this long before re-requesting. Keeps
 * the flow from becoming a "spam until they accept" channel without permanently
 * locking people out — 24h is short enough that a genuine reconsideration can
 * still happen (e.g., after meeting in class the next day).
 */
export const CONTACT_EXCHANGE_DECLINE_COOLDOWN_HOURS = 24;

/** Max simultaneous live Discover posts per user per category (ACTIVE and not yet expired). */
export const MAX_ACTIVE_CLASSMATE_POSTS_PER_CATEGORY = 3;

/**
 * @deprecated Main-tab routes are public without a cookie; see `middleware.ts`
 * `isPublicAppPath`. Kept for scripts/docs that still refer to "protected" lists.
 */
export const protectedRoutes = [
  "/admin",
  "/onboarding",
  "/connections",
  "/settings",
  "/profile/blocked",
  "/profile/edit",
];

export const authRoutes = ["/login", "/signup"];

export const adminEmails = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

/** Comma-separated login usernames (case-insensitive) who may use admin routes. */
export const adminUsernames = (process.env.ADMIN_USERNAMES ?? "")
  .split(",")
  .map((u) => u.trim().toLowerCase())
  .filter(Boolean);

/** True if this account is listed in ADMIN_EMAILS or ADMIN_USERNAMES. */
export function isConfiguredAdmin(user: { email: string | null; username: string }): boolean {
  const email = user.email?.trim().toLowerCase() ?? "";
  if (email && adminEmails.includes(email)) return true;
  const uname = user.username.trim().toLowerCase();
  return adminUsernames.length > 0 && adminUsernames.includes(uname);
}
