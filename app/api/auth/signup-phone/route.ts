import { normalizePhone } from "@/lib/auth/phone";
import { verifyPhoneSignupOtp } from "@/lib/auth/phone-otp";
import { hashPassword } from "@/lib/auth/password";
import { ensureAssistantBotConnection } from "@/lib/auth/assistant-bot";
import { validateNicknameForUser } from "@/lib/auth/nickname-fields";
import { isUsernameAvailable } from "@/lib/auth/username-availability";
import { SIGNUP_EMAIL_ERROR_CODES } from "@/lib/auth/email-otp-error-codes";
import { SIGNUP_DEFAULT_PROFILE, signupDefaultUserLanguages } from "@/lib/auth/signup-defaults";
import { createSession } from "@/lib/auth/session";
import { randomAvatarId } from "@/lib/constants/avatars";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { signupPhoneSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = parseBody(raw, signupPhoneSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }
    const values = parsed.data;
    const phone = normalizePhone(values.phone);
    if (!phone) {
      return error("Enter a valid phone number (include country code or use a CN mobile).", 422);
    }

    const otpOk = await verifyPhoneSignupOtp(phone, values.code);
    if (!otpOk) {
      return error("Invalid or expired verification code.", 400);
    }

    const taken = await prisma.user.findUnique({ where: { phone }, select: { id: true } });
    if (taken) {
      return error("That phone number is already registered.", 409);
    }

    const displayName = values.displayName.trim();
    const nicknameCheck = await validateNicknameForUser(displayName);
    if (!nicknameCheck.ok) {
      return error(
        nicknameCheck.reason === "reserved"
          ? "That display name is reserved."
          : "That display name is not valid.",
        422,
        SIGNUP_EMAIL_ERROR_CODES.NICKNAME_RESERVED,
      );
    }

    const username = values.username;
    if (!(await isUsernameAvailable(username))) {
      return error("That username is already taken.", 409);
    }

    const user = await prisma.user.create({
      data: {
        username,
        phone,
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
      warnDatabaseUnreachableThrottled("POST /api/auth/signup-phone");
      return error(
        "Cannot connect to the database. Check DATABASE_URL and that your Neon project is awake.",
        503,
      );
    }
    console.error(cause);
    return error("Unable to sign up.", 400);
  }
}
