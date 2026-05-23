/** Case-insensitive key for nickname uniqueness and search. */
export function nicknameToKey(nickname: string): string {
  return nickname.trim().toLowerCase();
}

const RESERVED_NICKNAME_KEYS = new Set(["guest", "sideseat assistant"]);

export function isReservedNicknameKey(key: string): boolean {
  return RESERVED_NICKNAME_KEYS.has(key);
}
