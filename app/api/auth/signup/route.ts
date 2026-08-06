import { Prisma } from "@prisma/client";

import { ensureAssistantBotConnection } from "@/lib/auth/assistant-bot";
import { validateNicknameForUser } from "@/lib/auth/nickname-fields";
import { hashPassword } from "@/lib/auth/password";
import { SIGNUP_DEFAULT_PROFILE } from "@/lib/auth/signup-defaults";
import { createSession } from "@/lib/auth/session";
import { SIGNUP_ERROR_CODES } from "@/lib/auth/signup-error-codes";
import { randomAvatarId } from "@/lib/constants/avatars";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { signupRequestSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = parseBody(raw, signupRequestSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422, SIGNUP_ERROR_CODES.INVALID_REQUEST);
    }
    const values = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { username: values.username },
    });

    if (existing) {
      return error("That username is already taken.", 409, SIGNUP_ERROR_CODES.USERNAME_TAKEN);
    }

    const nicknameCheck = await validateNicknameForUser(values.displayName);
    if (!nicknameCheck.ok) {
      return error(
        nicknameCheck.reason === "reserved"
          ? "That display name is reserved."
          : "That display name is not valid.",
        422,
        SIGNUP_ERROR_CODES.INVALID_REQUEST,
      );
    }

    const user = await prisma.user.create({
      data: {
        username: values.username,
        hashedPassword: await hashPassword(values.password),
        avatarUrl: randomAvatarId(),
        nickname: nicknameCheck.nickname,
        nicknameKey: nicknameCheck.nicknameKey,
        ...SIGNUP_DEFAULT_PROFILE,
        school: values.school,
        studentStatus: values.studentStatus,
        degreeLevel: values.degreeLevel,
        semester: values.studentStatus === "ALUMNI" ? null : values.semester,
        graduationYear: values.studentStatus === "ALUMNI" ? values.graduationYear : null,
        onboardingComplete: true,
      },
    });

    await ensureAssistantBotConnection(user.id);
    if (request.headers.get("x-sideseat-platform")?.toLowerCase() === "ios") {
      return ok(
        {
          userId: user.id,
          onboardingComplete: user.onboardingComplete,
        },
        { status: 201 },
      );
    }

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
      warnDatabaseUnreachableThrottled("POST /api/auth/signup");
      return error(
        "Cannot connect to the database. Check DATABASE_URL and that your Neon project is awake.",
        503,
        SIGNUP_ERROR_CODES.DB_UNAVAILABLE,
      );
    }
    if (
      cause instanceof Prisma.PrismaClientKnownRequestError &&
      cause.code === "P2002" &&
      Array.isArray(cause.meta?.target) &&
      cause.meta.target.includes("username")
    ) {
      return error("That username is already taken.", 409, SIGNUP_ERROR_CODES.USERNAME_TAKEN);
    }
    console.error(cause);
    return error("Unable to sign up.", 400, SIGNUP_ERROR_CODES.UNKNOWN);
  }
}
