import { Prisma } from "@prisma/client";

import { verifyEmailOtp } from "@/lib/auth/email-otp";
import { LOGIN_EMAIL_CHANGE_ERROR_CODES } from "@/lib/auth/login-email-change-error-codes";
import { normalizeSignupEmail } from "@/lib/auth/normalize-email";
import { getSessionUser } from "@/lib/auth/session";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { loginEmailChangeSchema } from "@/lib/validators/profile";

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user || user.isGuest) {
      return error("Sign in to update your login email.", 401, LOGIN_EMAIL_CHANGE_ERROR_CODES.UNAUTHORIZED);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return error("Invalid JSON body.", 400, LOGIN_EMAIL_CHANGE_ERROR_CODES.INVALID_REQUEST);
    }

    const parsed = parseBody(raw, loginEmailChangeSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422, LOGIN_EMAIL_CHANGE_ERROR_CODES.INVALID_REQUEST);
    }

    const email = normalizeSignupEmail(parsed.data.email);
    if (!email) {
      return error("Enter a valid email address.", 422, LOGIN_EMAIL_CHANGE_ERROR_CODES.EMAIL_INVALID);
    }

    const current = user.email?.trim().toLowerCase() ?? null;
    if (current === email) {
      return error(
        "This is already your login email.",
        400,
        LOGIN_EMAIL_CHANGE_ERROR_CODES.SAME_AS_CURRENT,
      );
    }

    const otpOk = await verifyEmailOtp(email, parsed.data.code, "change_email");
    if (!otpOk) {
      return error(
        "Invalid or expired verification code.",
        400,
        LOGIN_EMAIL_CHANGE_ERROR_CODES.CODE_INVALID,
      );
    }

    const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (taken && taken.id !== user.id) {
      return error(
        "That email is already registered.",
        409,
        LOGIN_EMAIL_CHANGE_ERROR_CODES.EMAIL_ALREADY_REGISTERED,
      );
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { email },
    });

    return ok({ email });
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("PATCH /api/profile/login-email");
      return error(
        "Cannot connect to the database. Check DATABASE_URL and that your database is awake.",
        503,
        LOGIN_EMAIL_CHANGE_ERROR_CODES.DB_UNAVAILABLE,
      );
    }
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2021") {
      return error(
        "Database schema is out of date. Run: npx prisma migrate deploy",
        503,
        LOGIN_EMAIL_CHANGE_ERROR_CODES.DB_SCHEMA,
      );
    }
    console.error(cause);
    return error("Unable to update login email.", 500, LOGIN_EMAIL_CHANGE_ERROR_CODES.UNKNOWN);
  }
}
