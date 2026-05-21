import { Prisma } from "@prisma/client";

import { EMAIL_OTP_ERROR_CODES } from "@/lib/auth/email-otp-error-codes";
import { sendEmailOtp } from "@/lib/auth/email-otp";
import { normalizeSignupEmail } from "@/lib/auth/normalize-email";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { forgotPasswordSendOtpSchema } from "@/lib/validators/auth";

/** Always returns success when the email format is valid (avoids account enumeration). */
export async function POST(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return error("Invalid JSON body.", 400, EMAIL_OTP_ERROR_CODES.INVALID_REQUEST);
    }

    const parsed = parseBody(raw, forgotPasswordSendOtpSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422, EMAIL_OTP_ERROR_CODES.INVALID_REQUEST);
    }

    const email = normalizeSignupEmail(parsed.data.email);
    if (!email) {
      return error("Enter a valid email address.", 422, EMAIL_OTP_ERROR_CODES.EMAIL_INVALID);
    }

    const account = await prisma.user.findUnique({
      where: { email },
      select: { id: true, isGuest: true },
    });

    if (!account || account.isGuest) {
      return ok({ sent: true as const });
    }

    const sent = await sendEmailOtp(email, "reset_password");
    if (!sent.ok) {
      return error(sent.error, sent.status ?? 503, sent.code);
    }

    return ok({ sent: true as const });
  } catch (cause) {
    console.error(cause);
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("POST /api/auth/forgot-password/send-otp");
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
