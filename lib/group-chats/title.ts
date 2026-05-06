type NamedUser = {
  id: string;
  username: string;
  nickname: string | null;
};

function displayName(user: NamedUser): string {
  return user.nickname?.trim() || user.username;
}

export function groupChatDisplayTitle(
  title: string | null | undefined,
  participants: NamedUser[],
  viewerId: string,
): string {
  const trimmed = title?.trim();
  if (trimmed) return trimmed;

  const peers = participants.filter((participant) => participant.id !== viewerId);
  if (peers.length === 0) return "Just you";

  const names = peers.map(displayName);
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} +${names.length - 3}`;
}
