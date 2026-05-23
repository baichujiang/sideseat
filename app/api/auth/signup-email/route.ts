import { SIGNUP_EMAIL_ERROR_CODES } from "@/lib/auth/email-otp-error-codes";
import { verifyEmailSignupOtp } from "@/lib/auth/email-otp";
import { normalizeSignupEmail } from "@/lib/auth/normalize-email";
import { hashPassword } from "@/lib/auth/password";
import { ensureAssistantBotConnection } from "@/lib/auth/assistant-bot";
import { validateNicknameForUser } from "@/lib/auth/nickname-fields";
import { isUsernameAvailable } from "@/lib/auth/username-availability";
import { SIGNUP_DEFAULT_PROFILE, signupDefaultUserLanguages } from "@/lib/auth/signup-defaults";
import { createSession } from "@/lib/auth/session";
import { randomAvatarId } from "@/lib/constants/avatars";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { signupEmailSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  try {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return error("Invalid JSON body.", 400, SIGNUP_EMAIL_ERROR_CODES.INVALID_REQUEST);
    }

    const parsed = parseBody(raw, signupEmailSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422, SIGNUP_EMAIL_ERROR_CODES.INVALID_REQUEST);
    }
    const values = parsed.data;
    const email = normalizeSignupEmail(values.email);
    if (!email) {
      return error("Enter a valid email address.", 422, SIGNUP_EMAIL_ERROR_CODES.INVALID_REQUEST);
    }

    const otpOk = await verifyEmailSignupOtp(email, values.code);
    if (!otpOk) {
      return error("Invalid or expired verification code.", 400, SIGNUP_EMAIL_ERROR_CODES.CODE_INVALID);
    }

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return error(
        "That email is already registered.",
        409,
        SIGNUP_EMAIL_ERROR_CODES.EMAIL_ALREADY_REGISTERED,
      );
    }

    const displayName = values.displayName.trim();
    const nicknameCheck = await validateNicknameForUser(displayName);
    if (!nicknameCheck.ok) {
      const code =
        nicknameCheck.reason === "taken"
          ? SIGNUP_EMAIL_ERROR_CODES.NICKNAME_TAKEN
          : SIGNUP_EMAIL_ERROR_CODES.NICKNAME_RESERVED;
      const message =
        nicknameCheck.reason === "taken"
          ? "That display name is already taken."
          : "That display name is reserved.";
      return error(message, 409, code);
    }

    const username = values.username;
    if (!(await isUsernameAvailable(username))) {
      return error(
        "That username is already taken.",
        409,
        SIGNUP_EMAIL_ERROR_CODES.USERNAME_TAKEN,
      );
    }

    const user = await prisma.user.create({
      data: {
        username,
        email,
        hashedPassword: await hashPassword(values.password),
        avatarUrl: randomAvatarId(),
        nickname: nicknameCheck.nickname,
        nicknameKey: nicknameCheck.nicknameKey,
        ...SIGNUP_DEFAULT_PROFILE,
        userLanguages: signupDefaultUserLanguages(),
      },
    });

    await ensureAssistantBotConnection(user.id);
    const { accessToken, expiresIn } = await createSession(user.id);

    return ok(
      {
        userId: user.id,
        onboardingComplete: user.onboardingComplete,
        accessToken,
        expiresIn,
      },
      { status: 201 },
    );
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("POST /api/auth/signup-email");
      return error(
        "Cannot connect to the database. Check DATABASE_URL and that your database is running.",
        503,
        SIGNUP_EMAIL_ERROR_CODES.DB_UNAVAILABLE,
      );
    }
    console.error(cause);
    return error("Unable to sign up.", 400, SIGNUP_EMAIL_ERROR_CODES.UNKNOWN);
  }
}
