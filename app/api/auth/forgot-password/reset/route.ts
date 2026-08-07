import { Prisma } from "@prisma/client";

import { verifyEmailOtp } from "@/lib/auth/email-otp";
import { hashPassword } from "@/lib/auth/password";
import { PASSWORD_RESET_ERROR_CODES } from "@/lib/auth/password-reset-error-codes";
import { normalizeSignupEmail } from "@/lib/auth/normalize-email";
import { createSession } from "@/lib/auth/session";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { forgotPasswordResetSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return error("Invalid JSON body.", 400, PASSWORD_RESET_ERROR_CODES.INVALID_REQUEST);
    }

    const parsed = parseBody(raw, forgotPasswordResetSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422, PASSWORD_RESET_ERROR_CODES.INVALID_REQUEST);
    }

    const email = normalizeSignupEmail(parsed.data.email);
    if (!email) {
      return error("Enter a valid email address.", 422, PASSWORD_RESET_ERROR_CODES.INVALID_REQUEST);
    }

    const otpOk = await verifyEmailOtp(email, parsed.data.code, "reset_password");
    if (!otpOk) {
      return error(
        "Invalid or expired verification code.",
        400,
        PASSWORD_RESET_ERROR_CODES.CODE_INVALID,
      );
    }

    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isGuest: true, onboardingComplete: true },
    });

    if (!user || user.isGuest) {
      return error(
        "Invalid or expired verification code.",
        400,
        PASSWORD_RESET_ERROR_CODES.CODE_INVALID,
      );
    }

    const hashedPassword = await hashPassword(parsed.data.password);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { hashedPassword },
      }),
      prisma.session.deleteMany({ where: { userId: user.id } }),
    ]);

    const { accessToken, expiresIn } = await createSession(user.id);

    return ok({
      userId: user.id,
      onboardingComplete: user.onboardingComplete,
      accessToken,
      expiresIn,
    });
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("POST /api/auth/forgot-password/reset");
      return error(
        "Cannot connect to the database. Check DATABASE_URL and that your database is awake.",
        503,
        PASSWORD_RESET_ERROR_CODES.DB_UNAVAILABLE,
      );
    }
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2021") {
      return error(
        "Database schema is out of date. Run: npx prisma migrate deploy",
        503,
        PASSWORD_RESET_ERROR_CODES.DB_SCHEMA,
      );
    }
    console.error(cause);
    return error("Unable to reset password.", 500, PASSWORD_RESET_ERROR_CODES.UNKNOWN);
  }
}
