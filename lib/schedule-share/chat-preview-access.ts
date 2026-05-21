import "server-only";

import { ConnectionStatus, type PrismaClient } from "@prisma/client";

import type { ScheduleShareLinkWithOwner } from "@/lib/schedule-share/resolve-link";
import { hashScheduleShareToken } from "@/lib/schedule-share/token";

type Db = Pick<PrismaClient, "scheduleShareLink" | "connection">;

export type ScheduleShareChatPreviewAccess =
  | { ok: true; link: ScheduleShareLinkWithOwner; expired: boolean }
  | { ok: false; reason: "not_found" | "revoked" | "forbidden" };

async function loadScheduleShareLinkForChatPreview(
  db: Db,
  plaintextToken: string,
): Promise<ScheduleShareLinkWithOwner | null> {
  const tokenHash = hashScheduleShareToken(plaintextToken);
  return db.scheduleShareLink.findUnique({
    where: { tokenHash },
    include: { owner: true },
  });
}

/** Chat thumbnail: no single-use consumption; viewer must be owner or active connection peer. */
export async function assertScheduleShareChatPreviewAccess(
  db: Db,
  plaintextToken: string,
  viewerUserId: string,
): Promise<ScheduleShareChatPreviewAccess> {
  const link = await loadScheduleShareLinkForChatPreview(db, plaintextToken);
  if (!link) return { ok: false, reason: "not_found" };
  if (link.revokedAt) return { ok: false, reason: "revoked" };

  const expired = link.expiresAt.getTime() <= Date.now();
  if (link.ownerUserId === viewerUserId) {
    return { ok: true, link, expired };
  }

  const connection = await db.connection.findFirst({
    where: {
      status: ConnectionStatus.ACTIVE,
      OR: [
        { userAId: viewerUserId, userBId: link.ownerUserId },
        { userAId: link.ownerUserId, userBId: viewerUserId },
      ],
    },
    select: { id: true },
  });
  if (!connection) return { ok: false, reason: "forbidden" };

  return { ok: true, link, expired };
}
