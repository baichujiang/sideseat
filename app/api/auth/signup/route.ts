import { ensureAssistantBotConnection } from "@/lib/auth/assistant-bot";
import { validateNicknameForUser } from "@/lib/auth/nickname-fields";
import { hashPassword } from "@/lib/auth/password";
import { NICKNAME_ERROR_CODES } from "@/lib/profile/nickname-api-errors";
import {
  defaultNicknameFromUsername,
  SIGNUP_DEFAULT_PROFILE,
  signupDefaultUserLanguages,
} from "@/lib/auth/signup-defaults";
import { createSession } from "@/lib/auth/session";
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
      return error(parsed.error, 422);
    }
    const values = parsed.data;

    const existing = await prisma.user.findUnique({
      where: { username: values.username },
    });

    if (existing) {
      return error("That username is already taken.", 409);
    }

    const defaultNick = defaultNicknameFromUsername(values.username);
    const nicknameCheck = await validateNicknameForUser(defaultNick);
    if (!nicknameCheck.ok) {
      const code =
        nicknameCheck.reason === "taken"
          ? NICKNAME_ERROR_CODES.TAKEN
          : NICKNAME_ERROR_CODES.RESERVED;
      return error(
        nicknameCheck.reason === "taken"
          ? "That display name is already taken."
          : "That display name is reserved.",
        409,
        code,
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
      warnDatabaseUnreachableThrottled("POST /api/auth/signup");
      return error(
        "Cannot connect to the database. Check DATABASE_URL and that your Neon project is awake.",
        503,
      );
    }
    console.error(cause);
    return error("Unable to sign up.", 400);
  }
}
