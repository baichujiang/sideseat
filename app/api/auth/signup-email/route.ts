import { LanguageProficiency, LanguageTag } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { allocateUniqueUsername } from "@/lib/auth/random-username";
import { defaultNicknameFromEmail, SIGNUP_DEFAULT_PROFILE } from "@/lib/auth/signup-defaults";
import { createSession } from "@/lib/auth/session";
import { randomAvatarId } from "@/lib/constants/avatars";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { signupEmailSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = parseBody(raw, signupEmailSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }
    const values = parsed.data;
    const email = values.email;

    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      return error("That email is already registered.", 409);
    }

    const username = await allocateUniqueUsername();

    const user = await prisma.user.create({
      data: {
        username,
        email,
        hashedPassword: await hashPassword(values.password),
        avatarUrl: randomAvatarId(),
        nickname: defaultNicknameFromEmail(email),
        school: SIGNUP_DEFAULT_PROFILE.school,
        userLanguages: {
          create: [{ tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT }],
        },
        onboardingComplete: false,
      },
    });

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
        "Cannot connect to the database. Check DATABASE_URL and that your Neon project is awake.",
        503,
      );
    }
    console.error(cause);
    return error("Unable to sign up.", 400);
  }
}
