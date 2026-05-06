import type { User } from "@prisma/client";

type SelfTitleUser = Pick<User, "nickname" | "username">;

/** Inbox / chat header label for the self-DM thread: nickname + (self), or custom remark when set. */
export function selfNotesDisplayTitle(user: SelfTitleUser, remark: string | null | undefined): string {
  const trimmed = remark?.trim();
  if (trimmed) return trimmed;
  const base = user.nickname?.trim() || user.username;
  return `${base} (self)`;
}
