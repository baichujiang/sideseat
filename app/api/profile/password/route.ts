import { Prisma } from "@prisma/client";

import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { PASSWORD_CHANGE_ERROR_CODES } from "@/lib/auth/password-change-error-codes";
import { getSessionUser, revokeOtherSessions } from "@/lib/auth/session";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { changePasswordSchema } from "@/lib/validators/profile";

export async function PATCH(request: Request) {
  try {
    const user = await getSessionUser();
    if (!user || user.isGuest) {
      return error("Sign in to change your password.", 401, PASSWORD_CHANGE_ERROR_CODES.UNAUTHORIZED);
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return error("Invalid JSON body.", 400, PASSWORD_CHANGE_ERROR_CODES.INVALID_REQUEST);
    }

    const parsed = parseBody(raw, changePasswordSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422, PASSWORD_CHANGE_ERROR_CODES.INVALID_REQUEST);
    }

    const matches = await verifyPassword(parsed.data.currentPassword, user.hashedPassword);
    if (!matches) {
      return error(
        "Current password is incorrect.",
        401,
        PASSWORD_CHANGE_ERROR_CODES.CURRENT_INVALID,
      );
    }

    const hashedPassword = await hashPassword(parsed.data.password);

    await prisma.user.update({
      where: { id: user.id },
      data: { hashedPassword },
    });

    await revokeOtherSessions(user.id);

    return ok({ saved: true as const });
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("PATCH /api/profile/password");
      return error(
        "Cannot connect to the database. Check DATABASE_URL and that your database is awake.",
        503,
        PASSWORD_CHANGE_ERROR_CODES.DB_UNAVAILABLE,
      );
    }
    if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2021") {
      return error(
        "Database schema is out of date. Run: npx prisma migrate deploy",
        503,
        PASSWORD_CHANGE_ERROR_CODES.DB_SCHEMA,
      );
    }
    console.error(cause);
    return error("Unable to change password.", 500, PASSWORD_CHANGE_ERROR_CODES.UNKNOWN);
  }
}
