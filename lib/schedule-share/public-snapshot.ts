import type { Prisma, PrismaClient } from "@prisma/client";

import type { ScheduleShareLinkWithOwner } from "@/lib/schedule-share/resolve-link";
import { parseRevealConfigJson, REVEAL_PRESET_KEYS_ALLOWLIST } from "@/lib/schedule-share/reveal-config";
import { defaultShareExpiresAt } from "@/lib/schedule-share/share-range-presets";
import { shareOwnerCalendarPickerRange } from "@/lib/schedule-share/share-selected-days";
import {
  collectInternalScheduleBlocks,
  internalBlocksToPublicSnapshot,
  scheduleShareOwnerDisplayLabel,
  type PublicScheduleShareSnapshot,
} from "@/lib/schedule-share/build-schedule-share-snapshot";

type Db = PrismaClient | Prisma.TransactionClient;

export async function buildPublicScheduleShareSnapshotForActiveLink(
  db: Db,
  link: ScheduleShareLinkWithOwner,
  options?: { scopeToIncludedDates?: boolean; forOwnerPreview?: boolean },
): Promise<PublicScheduleShareSnapshot> {
  const reveal = parseRevealConfigJson(link.revealConfig);
  const internal = await collectInternalScheduleBlocks(db, link.ownerUserId, link.rangeStart, link.rangeEnd);
  const ownerDisplayLabel = scheduleShareOwnerDisplayLabel(link.owner) ?? "";
  return internalBlocksToPublicSnapshot({
    internal,
    rangeStart: link.rangeStart,
    rangeEnd: link.rangeEnd,
    reveal,
    ownerDisplayLabel,
    linkExpiresAt: link.expiresAt,
    allowGuestProposals: link.allowGuestProposals,
    scopeToIncludedDates: options?.scopeToIncludedDates ?? true,
    forOwnerPreview: options?.forOwnerPreview ?? false,
  });
}

/** Live owner calendar before a link exists (create dialog, etc.). */
export async function buildOwnerPreviewSnapshotForUserId(
  db: Db,
  ownerUserId: string,
): Promise<PublicScheduleShareSnapshot> {
  const { rangeStart, rangeEnd } = shareOwnerCalendarPickerRange();
  const internal = await collectInternalScheduleBlocks(db, ownerUserId, rangeStart, rangeEnd);
  return internalBlocksToPublicSnapshot({
    internal,
    rangeStart,
    rangeEnd,
    reveal: {
      categoryIds: [],
      presetKeys: [...REVEAL_PRESET_KEYS_ALLOWLIST],
      hideAllDetails: false,
      includedDates: [],
    },
    ownerDisplayLabel: "",
    linkExpiresAt: defaultShareExpiresAt(new Date()),
    allowGuestProposals: true,
    scopeToIncludedDates: false,
    forOwnerPreview: true,
  });
}

/** Owner share-settings calendar: fixed picker window; selection only affects highlight/save. */
export async function buildOwnerPreviewScheduleShareSnapshotForActiveLink(
  db: Db,
  link: ScheduleShareLinkWithOwner,
): Promise<PublicScheduleShareSnapshot> {
  const reveal = parseRevealConfigJson(link.revealConfig);
  const { rangeStart, rangeEnd } = shareOwnerCalendarPickerRange();
  const internal = await collectInternalScheduleBlocks(db, link.ownerUserId, rangeStart, rangeEnd);
  const ownerDisplayLabel = scheduleShareOwnerDisplayLabel(link.owner) ?? "";
  return internalBlocksToPublicSnapshot({
    internal,
    rangeStart,
    rangeEnd,
    reveal,
    ownerDisplayLabel,
    linkExpiresAt: link.expiresAt,
    allowGuestProposals: link.allowGuestProposals,
    scopeToIncludedDates: false,
    forOwnerPreview: true,
  });
}
