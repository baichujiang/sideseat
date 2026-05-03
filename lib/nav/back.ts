/**
 * Shared helpers for "Back" navigation and `?returnTo=` handling.
 *
 * Rules:
 *  - A safe return path MUST start with `/` and MUST NOT start with `//`
 *    (the second form is an absolute URL to another origin).
 *  - When a `returnTo` is missing or unsafe, callers supply a logical
 *    fallback (e.g. `/courses` for course-detail pages).
 *  - Tab root pages (`/home`, `/inbox`, `/discover`, `/courses`, `/profile`)
 *    never display a back button; they rely on the bottom tab bar.
 */

/** Returns `raw` if it is a safe same-origin path, otherwise `fallback`. */
export function safeReturnPath(raw: string | null | undefined, fallback: string): string {
  if (typeof raw !== "string") return fallback;
  if (!raw.startsWith("/")) return fallback;
  if (raw.startsWith("//")) return fallback;
  return raw;
}

/**
 * Build a `?returnTo=<current>` query suffix for propagating the current
 * location into a child route. Returns an empty string if `current` is empty.
 *
 * Example:
 *   withReturnTo("/users/abc", "/courses/xyz") ->
 *     "/users/abc?returnTo=%2Fcourses%2Fxyz"
 */
export function withReturnTo(href: string, current: string | null | undefined): string {
  if (!current) return href;
  const separator = href.includes("?") ? "&" : "?";
  return `${href}${separator}returnTo=${encodeURIComponent(current)}`;
}
