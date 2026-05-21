import { EMAIL_OTP_ERROR_CODES, type EmailOtpErrorCode } from "@/lib/auth/email-otp-error-codes";
import {
  LOGIN_EMAIL_CHANGE_ERROR_CODES,
  type LoginEmailChangeErrorCode,
} from "@/lib/auth/login-email-change-error-codes";

export type LoginEmailFormErrors = {
  dbUnavailable: string;
  dbSchema: string;
  emailInvalid: string;
  emailAlreadyRegistered: string;
  sameAsCurrent: string;
  rateLimited: string;
  emailNotConfigured: string;
  emailSendFailed: string;
  codeInvalid: string;
  invalidRequest: string;
  networkError: string;
  unknown: string;
  codeSent: string;
  saved: string;
};

type ApiErrorPayload = { error?: string; code?: string } | null | undefined;

const SEND_CODE_TO_KEY: Record<EmailOtpErrorCode | LoginEmailChangeErrorCode, keyof LoginEmailFormErrors> = {
  [EMAIL_OTP_ERROR_CODES.DB_UNAVAILABLE]: "dbUnavailable",
  [EMAIL_OTP_ERROR_CODES.DB_SCHEMA]: "dbSchema",
  [EMAIL_OTP_ERROR_CODES.EMAIL_INVALID]: "emailInvalid",
  [EMAIL_OTP_ERROR_CODES.EMAIL_ALREADY_REGISTERED]: "emailAlreadyRegistered",
  [EMAIL_OTP_ERROR_CODES.RATE_LIMITED]: "rateLimited",
  [EMAIL_OTP_ERROR_CODES.EMAIL_NOT_CONFIGURED]: "emailNotConfigured",
  [EMAIL_OTP_ERROR_CODES.EMAIL_SEND_FAILED]: "emailSendFailed",
  [EMAIL_OTP_ERROR_CODES.INVALID_REQUEST]: "invalidRequest",
  [EMAIL_OTP_ERROR_CODES.UNKNOWN]: "unknown",
  [LOGIN_EMAIL_CHANGE_ERROR_CODES.UNAUTHORIZED]: "invalidRequest",
  [LOGIN_EMAIL_CHANGE_ERROR_CODES.DB_UNAVAILABLE]: "dbUnavailable",
  [LOGIN_EMAIL_CHANGE_ERROR_CODES.DB_SCHEMA]: "dbSchema",
  [LOGIN_EMAIL_CHANGE_ERROR_CODES.EMAIL_INVALID]: "emailInvalid",
  [LOGIN_EMAIL_CHANGE_ERROR_CODES.EMAIL_ALREADY_REGISTERED]: "emailAlreadyRegistered",
  [LOGIN_EMAIL_CHANGE_ERROR_CODES.SAME_AS_CURRENT]: "sameAsCurrent",
  [LOGIN_EMAIL_CHANGE_ERROR_CODES.CODE_INVALID]: "codeInvalid",
  [LOGIN_EMAIL_CHANGE_ERROR_CODES.INVALID_REQUEST]: "invalidRequest",
  [LOGIN_EMAIL_CHANGE_ERROR_CODES.UNKNOWN]: "unknown",
};

export function mapLoginEmailApiError(
  payload: ApiErrorPayload,
  messages: LoginEmailFormErrors,
  fallback: keyof LoginEmailFormErrors = "unknown",
): string {
  const code = payload?.code;
  if (code && code in SEND_CODE_TO_KEY) {
    const key = SEND_CODE_TO_KEY[code as EmailOtpErrorCode | LoginEmailChangeErrorCode];
    const msg = messages[key];
    if (msg) return msg;
  }
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  return messages[fallback];
}
