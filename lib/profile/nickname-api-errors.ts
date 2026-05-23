export const NICKNAME_ERROR_CODES = {
  TAKEN: "NICKNAME_TAKEN",
  RESERVED: "NICKNAME_RESERVED",
} as const;

export type NicknameErrorMessages = {
  taken: string;
  reserved: string;
};

export function mapNicknameApiError(
  payload: { error?: string; code?: string } | null | undefined,
  messages: NicknameErrorMessages,
  fallback: string,
): string {
  if (payload?.code === NICKNAME_ERROR_CODES.TAKEN) return messages.taken;
  if (payload?.code === NICKNAME_ERROR_CODES.RESERVED) return messages.reserved;
  return payload?.error?.trim() || fallback;
}

export function nicknameValidationErrorMessage(
  reason: "taken" | "reserved" | "invalid",
  messages: NicknameErrorMessages & { invalid?: string },
  fallback: string,
): string {
  if (reason === "taken") return messages.taken;
  if (reason === "reserved") return messages.reserved;
  return messages.invalid ?? fallback;
}
