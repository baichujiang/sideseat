import "server-only";
import { createHash, randomInt } from "crypto";

import { EMAIL_OTP_ERROR_CODES } from "@/lib/auth/email-otp-error-codes";
import { emailDeliveryConfigured } from "@/lib/email/resend";
import { sendLoginEmailChangeCodeEmail } from "@/lib/email/send-login-email-change-code";
import { sendPasswordResetCodeEmail } from "@/lib/email/send-password-reset-code";
import { sendSignupVerificationCodeEmail } from "@/lib/email/send-signup-verification-code";
import { prisma } from "@/lib/db/prisma";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 8;

function otpPepper(): string {
  return process.env.SESSION_SECRET ?? process.env.ACCESS_TOKEN_SECRET ?? "dev-otp-pepper-change-me";
}

export function hashEmailOtp(email: string, code: string): string {
  return createHash("sha256").update(`${otpPepper()}|email|${email}|${code}`).digest("hex");
}

function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export type EmailOtpPurpose = "signup" | "change_email" | "reset_password";

export async function sendEmailOtp(
  email: string,
  purpose: EmailOtpPurpose,
): Promise<{ ok: true } | { ok: false; error: string; status?: number; code: string }> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.emailOtpChallenge.count({
    where: {
      email,
      purpose,
      createdAt: { gte: since },
    },
  });
  if (recent >= MAX_SENDS_PER_HOUR) {
    return {
      ok: false,
      error: "Too many codes sent. Try again in an hour.",
      status: 429,
      code: EMAIL_OTP_ERROR_CODES.RATE_LIMITED,
    };
  }

  await prisma.emailOtpChallenge.deleteMany({ where: { email, purpose } });

  const code = sixDigitCode();
  const codeHash = hashEmailOtp(email, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.emailOtpChallenge.create({
    data: {
      email,
      codeHash,
      purpose,
      expiresAt,
    },
  });

  const mailed =
    purpose === "signup"
      ? await sendSignupVerificationCodeEmail({ email, code })
      : purpose === "change_email"
        ? await sendLoginEmailChangeCodeEmail({ email, code })
        : await sendPasswordResetCodeEmail({ email, code });
  if (mailed.sent) {
    return { ok: true };
  }

  console.error(`[email OTP] send failed purpose=${purpose} to=${email}: ${mailed.reason}`);
  await prisma.emailOtpChallenge.deleteMany({ where: { email, purpose } });
  const configured = emailDeliveryConfigured();
  return {
    ok: false,
    error: configured
      ? "Could not send email. Try again later."
      : "Email is not configured on this server. Set RESEND_API_KEY and EMAIL_FROM.",
    status: 503,
    code: configured
      ? EMAIL_OTP_ERROR_CODES.EMAIL_SEND_FAILED
      : EMAIL_OTP_ERROR_CODES.EMAIL_NOT_CONFIGURED,
  };
}

export async function sendEmailSignupOtp(email: string) {
  return sendEmailOtp(email, "signup");
}

export async function verifyEmailOtp(
  email: string,
  code: string,
  purpose: EmailOtpPurpose,
): Promise<boolean> {
  const row = await prisma.emailOtpChallenge.findFirst({
    where: { email, purpose, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;
  const ok = hashEmailOtp(email, code) === row.codeHash;
  if (ok) {
    await prisma.emailOtpChallenge.deleteMany({ where: { email, purpose } });
  }
  return ok;
}

export async function verifyEmailSignupOtp(email: string, code: string): Promise<boolean> {
  return verifyEmailOtp(email, code, "signup");
}
