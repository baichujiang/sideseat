import type { Connection } from "@prisma/client";

/** Max length for a private contact remark (display name for you only). */
export const CONTACT_REMARK_MAX_LEN = 64;

type RemarkFields = Pick<Connection, "userAId" | "userBId" | "contactRemarkByA" | "contactRemarkByB">;

/** The viewer's private remark for this connection, trimmed, or null. */
export function contactRemarkForViewer(c: RemarkFields, viewerId: string): string | null {
  if (c.userAId === c.userBId) {
    const v = c.contactRemarkByA?.trim();
    return v ? v : null;
  }
  if (c.userAId === viewerId) {
    const v = c.contactRemarkByA?.trim();
    return v ? v : null;
  }
  if (c.userBId === viewerId) {
    const v = c.contactRemarkByB?.trim();
    return v ? v : null;
  }
  return null;
}
