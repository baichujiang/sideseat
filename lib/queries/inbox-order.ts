export function getConnectionPinnedAt<
  T extends {
    userAId: string;
    userBId: string;
    pinnedByAAt: Date | null;
    pinnedByBAt: Date | null;
  },
>(connection: T, userId: string) {
  return connection.userAId === userId ? connection.pinnedByAAt : connection.pinnedByBAt;
}

export function compareConnectionsForInbox<
  T extends {
    userAId: string;
    userBId: string;
    pinnedByAAt: Date | null;
    pinnedByBAt: Date | null;
    updatedAt: Date;
  },
>(a: T, b: T, userId: string) {
  const aPinnedAt = getConnectionPinnedAt(a, userId);
  const bPinnedAt = getConnectionPinnedAt(b, userId);

  if (aPinnedAt && bPinnedAt) {
    return bPinnedAt.getTime() - aPinnedAt.getTime();
  }
  if (aPinnedAt) return -1;
  if (bPinnedAt) return 1;
  return b.updatedAt.getTime() - a.updatedAt.getTime();
}
