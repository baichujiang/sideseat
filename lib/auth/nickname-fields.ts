import "server-only";

import { isReservedNicknameKey, nicknameToKey } from "@/lib/auth/nickname-key";

export { nicknameToKey, isReservedNicknameKey } from "@/lib/auth/nickname-key";

export async function isNicknameKeyAvailable(key: string, excludeUserId?: string): Promise<boolean> {
  void excludeUserId;
  return !isReservedNicknameKey(key);
}

export type NicknameValidationResult =
  | { ok: true; nickname: string; nicknameKey: string }
  | { ok: false; reason: "taken" | "reserved" | "invalid" };

export async function validateNicknameForUser(
  nickname: string,
  options?: { excludeUserId?: string },
): Promise<NicknameValidationResult> {
  void options;
  const trimmed = nickname.trim();
  if (trimmed.length < 2 || trimmed.length > 32) {
    return { ok: false, reason: "invalid" };
  }

  const key = nicknameToKey(trimmed);
  if (isReservedNicknameKey(key)) {
    return { ok: false, reason: "reserved" };
  }
  return { ok: true, nickname: trimmed, nicknameKey: key };
}

/** Guest accounts share display label "Guest" but do not occupy a nickname key. */
export function guestNicknameFields(display = "Guest"): { nickname: string; nicknameKey: null } {
  return { nickname: display, nicknameKey: null };
}
