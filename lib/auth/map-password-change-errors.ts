import {
  PASSWORD_CHANGE_ERROR_CODES,
  type PasswordChangeErrorCode,
} from "@/lib/auth/password-change-error-codes";

export type PasswordChangeFormErrors = {
  dbUnavailable: string;
  dbSchema: string;
  currentInvalid: string;
  sameAsCurrent: string;
  invalidRequest: string;
  networkError: string;
  unknown: string;
  saved: string;
};

type ApiErrorPayload = { error?: string; code?: string } | null | undefined;

const CODE_TO_KEY: Record<PasswordChangeErrorCode, keyof PasswordChangeFormErrors> = {
  [PASSWORD_CHANGE_ERROR_CODES.UNAUTHORIZED]: "invalidRequest",
  [PASSWORD_CHANGE_ERROR_CODES.DB_UNAVAILABLE]: "dbUnavailable",
  [PASSWORD_CHANGE_ERROR_CODES.DB_SCHEMA]: "dbSchema",
  [PASSWORD_CHANGE_ERROR_CODES.CURRENT_INVALID]: "currentInvalid",
  [PASSWORD_CHANGE_ERROR_CODES.SAME_AS_CURRENT]: "sameAsCurrent",
  [PASSWORD_CHANGE_ERROR_CODES.INVALID_REQUEST]: "invalidRequest",
  [PASSWORD_CHANGE_ERROR_CODES.UNKNOWN]: "unknown",
};

export function mapPasswordChangeApiError(
  payload: ApiErrorPayload,
  messages: PasswordChangeFormErrors,
): string {
  const code = payload?.code;
  if (code && code in CODE_TO_KEY) {
    const key = CODE_TO_KEY[code as PasswordChangeErrorCode];
    const msg = messages[key];
    if (msg) return msg;
  }
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  return messages.unknown;
}
