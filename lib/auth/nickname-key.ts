/** Case-insensitive key for nickname search. Nicknames are display names and are not unique. */
export function nicknameToKey(nickname: string): string {
  return nickname.trim().toLowerCase();
}

const RESERVED_NICKNAME_KEYS = new Set(["guest", "sideseat assistant"]);

export function isReservedNicknameKey(key: string): boolean {
  return RESERVED_NICKNAME_KEYS.has(key);
}
