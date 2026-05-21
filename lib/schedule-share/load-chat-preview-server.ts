import "server-only";

import type { PrismaClient } from "@prisma/client";
import { MessageType } from "@prisma/client";

import { assertScheduleShareChatPreviewAccess } from "@/lib/schedule-share/chat-preview-access";
import type { ScheduleShareChatPreviewPayload } from "@/lib/schedule-share/chat-preview-types";
import { buildPublicScheduleShareSnapshotForActiveLink } from "@/lib/schedule-share/public-snapshot";
import { plainTokenFromScheduleShareRecipientUrl } from "@/lib/schedule-share/share-link-urls";

export async function loadScheduleShareChatPreviewForViewer(
  db: PrismaClient,
  plaintextToken: string,
  viewerUserId: string,
): Promise<ScheduleShareChatPreviewPayload | null> {
  const access = await assertScheduleShareChatPreviewAccess(db, plaintextToken, viewerUserId);
  if (!access.ok) return null;

  const snapshot = await buildPublicScheduleShareSnapshotForActiveLink(db, access.link);
  return {
    snapshot,
    expired: access.expired,
    ownerDisplayLabel: snapshot.ownerDisplayLabel,
  };
}

/** Preload schedule-share thumbnails for all cards in a chat thread (server render). */
export async function loadScheduleShareChatPreviewsForMessages(
  db: PrismaClient,
  messages: { type: MessageType; body: string }[],
  viewerUserId: string,
): Promise<Map<string, ScheduleShareChatPreviewPayload>> {
  const tokens = new Set<string>();
  for (const message of messages) {
    if (message.type !== MessageType.SCHEDULE_SHARE_CARD) continue;
    const token = plainTokenFromScheduleShareRecipientUrl(message.body.trim());
    if (token) tokens.add(token);
  }

  const entries = await Promise.all(
    [...tokens].map(async (token) => {
      const preview = await loadScheduleShareChatPreviewForViewer(db, token, viewerUserId);
      return [token, preview] as const;
    }),
  );

  const map = new Map<string, ScheduleShareChatPreviewPayload>();
  for (const [token, preview] of entries) {
    if (preview) map.set(token, preview);
  }
  return map;
}
