import "server-only";
import { createHash, randomInt } from "crypto";

import { emailDeliveryConfigured } from "@/lib/email/resend";
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

export type EmailOtpPurpose = "signup";

export async function sendEmailSignupOtp(email: string): Promise<
  | { ok: true; devCode?: string }
  | { ok: false; error: string; status?: number }
> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.emailOtpChallenge.count({
    where: {
      email,
      purpose: "signup",
      createdAt: { gte: since },
    },
  });
  if (recent >= MAX_SENDS_PER_HOUR) {
    return { ok: false, error: "Too many codes sent. Try again in an hour.", status: 429 };
  }

  await prisma.emailOtpChallenge.deleteMany({ where: { email, purpose: "signup" } });

  const code = sixDigitCode();
  const codeHash = hashEmailOtp(email, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.emailOtpChallenge.create({
    data: {
      email,
      codeHash,
      purpose: "signup",
      expiresAt,
    },
  });

  const mailed = await sendSignupVerificationCodeEmail({ email, code });
  if (mailed.sent) {
    return { ok: true };
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(`[dev email OTP] to=${email} code=${code} (${mailed.reason})`);
    return { ok: true, devCode: code };
  }

  await prisma.emailOtpChallenge.deleteMany({ where: { email, purpose: "signup" } });
  const hint = emailDeliveryConfigured()
    ? "Could not send email. Try again later."
    : "Email is not configured on this server. Set RESEND_API_KEY and EMAIL_FROM.";
  return { ok: false, error: hint, status: 503 };
}

export async function verifyEmailSignupOtp(email: string, code: string): Promise<boolean> {
  const row = await prisma.emailOtpChallenge.findFirst({
    where: { email, purpose: "signup", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;
  const ok = hashEmailOtp(email, code) === row.codeHash;
  if (ok) {
    await prisma.emailOtpChallenge.deleteMany({ where: { email, purpose: "signup" } });
  }
  return ok;
}
