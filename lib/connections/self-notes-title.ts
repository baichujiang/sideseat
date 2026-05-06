import type { User } from "@prisma/client";

type SelfTitleUser = Pick<User, "nickname" | "username">;

/** Inbox / chat header label for the self-DM thread: always keep a visible `(self)` suffix. */
export function selfNotesDisplayTitle(user: SelfTitleUser, remark: string | null | undefined): string {
  const trimmed = remark?.trim();
  const base = trimmed || user.nickname?.trim() || user.username;
  return /\s\(self\)$/i.test(base) ? base : `${base} (self)`;
}
