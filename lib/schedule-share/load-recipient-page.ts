import type { PrismaClient } from "@prisma/client";

import type { PublicScheduleShareSnapshot } from "@/lib/schedule-share/build-schedule-share-snapshot";
import { buildPublicScheduleShareSnapshotForActiveLink } from "@/lib/schedule-share/public-snapshot";
import { findScheduleShareLinkByPlainToken } from "@/lib/schedule-share/resolve-link";

type ResolvedScheduleShareLink = Extract<
  Awaited<ReturnType<typeof findScheduleShareLinkByPlainToken>>,
  { ok: true }
>;

export type ScheduleShareRecipientPageData =
  | { ok: true; snapshot: PublicScheduleShareSnapshot; resolved: ResolvedScheduleShareLink }
  | { ok: false };

export async function loadScheduleShareRecipientPage(
  db: PrismaClient,
  token: string,
  options?: { viewerUserId?: string },
): Promise<ScheduleShareRecipientPageData> {
  const decoded = decodeURIComponent(token);
  const resolved = await findScheduleShareLinkByPlainToken(db, decoded, {
    viewerUserId: options?.viewerUserId,
  });
  if (!resolved.ok) {
    return { ok: false };
  }
  const snapshot = await buildPublicScheduleShareSnapshotForActiveLink(db, resolved.link);
  return { ok: true, snapshot, resolved };
}
