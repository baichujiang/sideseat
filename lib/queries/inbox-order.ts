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

export function isConnectionPinned<
  T extends {
    userAId: string;
    userBId: string;
    pinnedByAAt: Date | null;
    pinnedByBAt: Date | null;
  },
>(connection: T, userId: string) {
  return Boolean(getConnectionPinnedAt(connection, userId));
}

export function compareConnectionsForInbox<
  T extends {
    userAId: string;
    userBId: string;
    pinnedByAAt: Date | null;
    pinnedByBAt: Date | null;
  },
>(a: T, b: T, userId: string, getSortAt: (value: T) => Date) {
  const aPinned = isConnectionPinned(a, userId);
  const bPinned = isConnectionPinned(b, userId);

  if (aPinned !== bPinned) {
    return aPinned ? -1 : 1;
  }

  return getSortAt(b).getTime() - getSortAt(a).getTime();
}
