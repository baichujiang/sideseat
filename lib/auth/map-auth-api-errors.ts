import {
  EMAIL_OTP_ERROR_CODES,
  SIGNUP_EMAIL_ERROR_CODES,
  type EmailOtpErrorCode,
  type SignupEmailErrorCode,
} from "@/lib/auth/email-otp-error-codes";
import {
  PASSWORD_RESET_ERROR_CODES,
  type PasswordResetErrorCode,
} from "@/lib/auth/password-reset-error-codes";

export type AuthFormEmailOtpErrors = {
  dbUnavailable: string;
  dbSchema: string;
  emailInvalid: string;
  emailAlreadyRegistered: string;
  rateLimited: string;
  emailNotConfigured: string;
  emailSendFailed: string;
  invalidRequest: string;
  networkError: string;
  unknown: string;
  codeSent: string;
};

export type AuthFormSignupEmailErrors = {
  dbUnavailable: string;
  codeInvalid: string;
  emailAlreadyRegistered: string;
  invalidRequest: string;
  unknown: string;
};

export type AuthFormForgotPasswordErrors = {
  dbUnavailable: string;
  dbSchema: string;
  emailInvalid: string;
  rateLimited: string;
  emailNotConfigured: string;
  emailSendFailed: string;
  codeInvalid: string;
  invalidRequest: string;
  networkError: string;
  unknown: string;
  codeSent: string;
  resetSuccess: string;
};

type ApiErrorPayload = { error?: string; code?: string } | null | undefined;

const EMAIL_OTP_CODE_TO_KEY: Record<EmailOtpErrorCode, keyof AuthFormEmailOtpErrors> = {
  [EMAIL_OTP_ERROR_CODES.DB_UNAVAILABLE]: "dbUnavailable",
  [EMAIL_OTP_ERROR_CODES.DB_SCHEMA]: "dbSchema",
  [EMAIL_OTP_ERROR_CODES.EMAIL_INVALID]: "emailInvalid",
  [EMAIL_OTP_ERROR_CODES.EMAIL_ALREADY_REGISTERED]: "emailAlreadyRegistered",
  [EMAIL_OTP_ERROR_CODES.RATE_LIMITED]: "rateLimited",
  [EMAIL_OTP_ERROR_CODES.EMAIL_NOT_CONFIGURED]: "emailNotConfigured",
  [EMAIL_OTP_ERROR_CODES.EMAIL_SEND_FAILED]: "emailSendFailed",
  [EMAIL_OTP_ERROR_CODES.INVALID_REQUEST]: "invalidRequest",
  [EMAIL_OTP_ERROR_CODES.UNKNOWN]: "unknown",
};

const SIGNUP_EMAIL_CODE_TO_KEY: Record<SignupEmailErrorCode, keyof AuthFormSignupEmailErrors> = {
  [SIGNUP_EMAIL_ERROR_CODES.DB_UNAVAILABLE]: "dbUnavailable",
  [SIGNUP_EMAIL_ERROR_CODES.CODE_INVALID]: "codeInvalid",
  [SIGNUP_EMAIL_ERROR_CODES.EMAIL_ALREADY_REGISTERED]: "emailAlreadyRegistered",
  [SIGNUP_EMAIL_ERROR_CODES.INVALID_REQUEST]: "invalidRequest",
  [SIGNUP_EMAIL_ERROR_CODES.UNKNOWN]: "unknown",
};

function mapByCode(
  payload: ApiErrorPayload,
  codeToKey: Record<string, string>,
  messages: Record<string, string>,
  fallback: string,
): string {
  const code = payload?.code;
  if (code && code in codeToKey) {
    const key = codeToKey[code as string];
    const msg = messages[key as string];
    if (msg) return msg;
  }
  if (typeof payload?.error === "string" && payload.error.trim()) return payload.error;
  return fallback;
}

export function mapEmailOtpApiError(
  payload: ApiErrorPayload,
  messages: AuthFormEmailOtpErrors,
): string {
  return mapByCode(payload, EMAIL_OTP_CODE_TO_KEY, messages, messages.unknown);
}

export function mapSignupEmailApiError(
  payload: ApiErrorPayload,
  messages: AuthFormSignupEmailErrors,
): string {
  return mapByCode(payload, SIGNUP_EMAIL_CODE_TO_KEY, messages, messages.unknown);
}

const FORGOT_PASSWORD_SEND_CODE_TO_KEY: Record<
  EmailOtpErrorCode | PasswordResetErrorCode,
  keyof AuthFormForgotPasswordErrors
> = {
  [EMAIL_OTP_ERROR_CODES.DB_UNAVAILABLE]: "dbUnavailable",
  [EMAIL_OTP_ERROR_CODES.DB_SCHEMA]: "dbSchema",
  [EMAIL_OTP_ERROR_CODES.EMAIL_INVALID]: "emailInvalid",
  [EMAIL_OTP_ERROR_CODES.EMAIL_ALREADY_REGISTERED]: "invalidRequest",
  [EMAIL_OTP_ERROR_CODES.RATE_LIMITED]: "rateLimited",
  [EMAIL_OTP_ERROR_CODES.EMAIL_NOT_CONFIGURED]: "emailNotConfigured",
  [EMAIL_OTP_ERROR_CODES.EMAIL_SEND_FAILED]: "emailSendFailed",
  [EMAIL_OTP_ERROR_CODES.INVALID_REQUEST]: "invalidRequest",
  [EMAIL_OTP_ERROR_CODES.UNKNOWN]: "unknown",
  [PASSWORD_RESET_ERROR_CODES.DB_UNAVAILABLE]: "dbUnavailable",
  [PASSWORD_RESET_ERROR_CODES.DB_SCHEMA]: "dbSchema",
  [PASSWORD_RESET_ERROR_CODES.EMAIL_INVALID]: "emailInvalid",
  [PASSWORD_RESET_ERROR_CODES.CODE_INVALID]: "codeInvalid",
  [PASSWORD_RESET_ERROR_CODES.INVALID_REQUEST]: "invalidRequest",
  [PASSWORD_RESET_ERROR_CODES.UNKNOWN]: "unknown",
};

export function mapForgotPasswordSendApiError(
  payload: ApiErrorPayload,
  messages: AuthFormForgotPasswordErrors,
): string {
  return mapByCode(payload, FORGOT_PASSWORD_SEND_CODE_TO_KEY, messages, messages.unknown);
}

export function mapForgotPasswordResetApiError(
  payload: ApiErrorPayload,
  messages: AuthFormForgotPasswordErrors,
): string {
  return mapByCode(payload, FORGOT_PASSWORD_SEND_CODE_TO_KEY, messages, messages.unknown);
}
