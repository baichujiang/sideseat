import { hashPassword } from "@/lib/auth/password";
import {
  defaultNicknameFromUsername,
  SIGNUP_DEFAULT_PROFILE,
} from "@/lib/auth/signup-defaults";
import { createSession } from "@/lib/auth/session";
import { randomAvatarId } from "@/lib/constants/avatars";
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

    const user = await prisma.user.create({
      data: {
        username: values.username,
        hashedPassword: await hashPassword(values.password),
        avatarUrl: randomAvatarId(),
        nickname: defaultNicknameFromUsername(values.username),
        school: SIGNUP_DEFAULT_PROFILE.school,
        onboardingComplete: false,
      },
    });

    await createSession(user.id);

    return ok({ userId: user.id, onboardingComplete: user.onboardingComplete }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to sign up.", 400);
  }
}
