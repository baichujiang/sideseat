import { Prisma } from "@prisma/client";

import { EMAIL_OTP_ERROR_CODES } from "@/lib/auth/email-otp-error-codes";
import { sendEmailOtp } from "@/lib/auth/email-otp";
import { LOGIN_EMAIL_CHANGE_ERROR_CODES } from "@/lib/auth/login-email-change-error-codes";
import { normalizeSignupEmail } from "@/lib/auth/normalize-email";
import { getSessionUser } from "@/lib/auth/session";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { loginEmailSendOtpSchema } from "@/lib/validators/profile";

export async function POST(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user || user.isGuest) {
      return error("Sign in to update your login email.", 401, LOGIN_EMAIL_CHANGE_ERROR_CODES.UNAUTHORIZED);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return error("Invalid JSON body.", 400, EMAIL_OTP_ERROR_CODES.INVALID_REQUEST);
    }

    const parsed = parseBody(raw, loginEmailSendOtpSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422, EMAIL_OTP_ERROR_CODES.INVALID_REQUEST);
    }

    const email = normalizeSignupEmail(parsed.data.email);
    if (!email) {
      return error("Enter a valid email address.", 422, EMAIL_OTP_ERROR_CODES.EMAIL_INVALID);
    }

    const current = user.email?.trim().toLowerCase() ?? null;
    if (current === email) {
      return error(
        "This is already your login email.",
        400,
        LOGIN_EMAIL_CHANGE_ERROR_CODES.SAME_AS_CURRENT,
      );
    }

    const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (taken && taken.id !== user.id) {
      return error("That email is already registered.", 409, EMAIL_OTP_ERROR_CODES.EMAIL_ALREADY_REGISTERED);
    }

    const sent = await sendEmailOtp(email, "change_email");
    if (!sent.ok) {
      return error(sent.error, sent.status ?? 503, sent.code);
    }

    return ok({ sent: true as const });
  } catch (cause) {
    console.error(cause);
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("POST /api/profile/login-email/send-otp");
      return error(
        "Cannot connect to the database. Check DATABASE_URL and that your database is awake.",
        503,
        EMAIL_OTP_ERROR_CODES.DB_UNAVAILABLE,
      );
    }
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2021") {
      return error(
        "Database schema is out of date. Run: npx prisma migrate deploy",
        503,
        EMAIL_OTP_ERROR_CODES.DB_SCHEMA,
      );
    }
    return error("Unable to send code.", 500, EMAIL_OTP_ERROR_CODES.UNKNOWN);
  }
}
