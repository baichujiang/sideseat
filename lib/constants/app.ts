export const APP_NAME = "SideSeat";
export const SESSION_COOKIE_NAME = "sideseat_session";
export const SESSION_DURATION_DAYS = 14;
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
