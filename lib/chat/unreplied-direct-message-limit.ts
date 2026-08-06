import { UNREPLIED_DIRECT_MESSAGE_LIMIT } from "@/lib/constants/app";

export { UNREPLIED_DIRECT_MESSAGE_LIMIT };

export type UnrepliedMessageLike = {
  senderId: string;
  type?: string | null;
};

/** True once both participants have sent at least one non-system message. */
export function hasMutualDirectExchange(
  messages: UnrepliedMessageLike[],
  viewerId: string,
  peerId: string,
): boolean {
  if (!viewerId || !peerId || viewerId === peerId) return false;
  let viewerHasSent = false;
  let peerHasSent = false;
  for (const message of messages) {
    if (message.type === "SYSTEM") continue;
    if (message.senderId === viewerId) viewerHasSent = true;
    if (message.senderId === peerId) peerHasSent = true;
    if (viewerHasSent && peerHasSent) return true;
  }
  return false;
}

/**
 * Count viewer messages while the first-contact gate is still active.
 * SYSTEM rows do not count; soft-deleted rows should still be included.
 */
export function countUnrepliedDirectStreak(
  messagesNewestFirst: UnrepliedMessageLike[],
  viewerId: string,
  peerId: string,
): number {
  if (!viewerId || !peerId || viewerId === peerId) return 0;
  if (hasMutualDirectExchange(messagesNewestFirst, viewerId, peerId)) return 0;
  let unreplied = 0;
  for (const message of messagesNewestFirst) {
    if (message.senderId === viewerId && message.type !== "SYSTEM") {
      unreplied += 1;
    }
  }
  return unreplied;
}

/** True when the composer should show the "up to 2 before they reply" hint. */
export function shouldShowUnrepliedDirectHint(
  messagesNewestFirst: UnrepliedMessageLike[],
  viewerId: string,
  peerId: string,
  limit = UNREPLIED_DIRECT_MESSAGE_LIMIT,
): boolean {
  if (!viewerId || !peerId || viewerId === peerId) return false;
  if (hasMutualDirectExchange(messagesNewestFirst, viewerId, peerId)) return false;
  const streak = countUnrepliedDirectStreak(messagesNewestFirst, viewerId, peerId);
  if (streak >= limit) return false;
  const newest = messagesNewestFirst[0];
  if (!newest) return true;
  return newest.senderId !== peerId;
}

export function isUnrepliedDirectSendBlocked(
  streak: number,
  limit = UNREPLIED_DIRECT_MESSAGE_LIMIT,
): boolean {
  return streak >= limit;
}
