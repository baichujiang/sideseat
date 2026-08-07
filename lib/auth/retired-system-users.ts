/** System accounts that are no longer part of the product experience. */
export const RETIRED_SYSTEM_USERNAMES = ["sideseat_assistant"] as const;

export function isRetiredSystemUser(user: { username: string }): boolean {
  return (RETIRED_SYSTEM_USERNAMES as readonly string[]).includes(user.username);
}
