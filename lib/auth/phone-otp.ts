import "server-only";
import { createHash, randomInt } from "crypto";

import { prisma } from "@/lib/db/prisma";

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_SENDS_PER_HOUR = 8;

function otpPepper(): string {
  return process.env.SESSION_SECRET ?? process.env.ACCESS_TOKEN_SECRET ?? "dev-otp-pepper-change-me";
}

export function hashPhoneOtp(phone: string, code: string): string {
  return createHash("sha256").update(`${otpPepper()}|${phone}|${code}`).digest("hex");
}

function sixDigitCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function sendViaTwilio(to: string, body: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const token = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_FROM_NUMBER?.trim();
  if (!sid || !token || !from) {
    return { ok: false, error: "SMS not configured." };
  }

  const auth = Buffer.from(`${sid}:${token}`).toString("base64");
  const params = new URLSearchParams({
    To: to,
    From: from,
    Body: body,
  });

  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  if (!res.ok) {
    const t = await res.text().catch(() => "");
    console.error("Twilio SMS error", res.status, t.slice(0, 300));
    return { ok: false, error: "Could not send SMS. Try again later." };
  }
  return { ok: true };
}

export type PhoneOtpPurpose = "signup";

export async function sendPhoneSignupOtp(phone: string): Promise<
  | { ok: true }
  | { ok: false; error: string; status?: number }
> {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const recent = await prisma.phoneOtpChallenge.count({
    where: {
      phone,
      purpose: "signup",
      createdAt: { gte: since },
    },
  });
  if (recent >= MAX_SENDS_PER_HOUR) {
    return { ok: false, error: "Too many codes sent. Try again in an hour.", status: 429 };
  }

  await prisma.phoneOtpChallenge.deleteMany({ where: { phone, purpose: "signup" } });

  const code = sixDigitCode();
  const codeHash = hashPhoneOtp(phone, code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MS);

  await prisma.phoneOtpChallenge.create({
    data: {
      phone,
      codeHash,
      purpose: "signup",
      expiresAt,
    },
  });

  const twilio = await sendViaTwilio(phone, `Your ClassLink code: ${code}. It expires in 10 minutes.`);
  if (twilio.ok) {
    return { ok: true };
  }

  if (process.env.NODE_ENV !== "production") {
    console.warn(`[dev SMS] to=${phone} code=${code} (Twilio not configured)`);
    return { ok: true };
  }

  await prisma.phoneOtpChallenge.deleteMany({ where: { phone, purpose: "signup" } });
  return {
    ok: false,
    error:
      "SMS is not configured on this server. Ask the admin to set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_FROM_NUMBER.",
    status: 503,
  };
}

export async function verifyPhoneSignupOtp(phone: string, code: string): Promise<boolean> {
  const row = await prisma.phoneOtpChallenge.findFirst({
    where: { phone, purpose: "signup", expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return false;
  const ok = hashPhoneOtp(phone, code) === row.codeHash;
  if (ok) {
    await prisma.phoneOtpChallenge.deleteMany({ where: { phone, purpose: "signup" } });
  }
  return ok;
}
