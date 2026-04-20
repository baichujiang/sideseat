import { ClientSignalAction } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { recordClientSignal } from "@/lib/abuse/client-signals";
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
      await recordClientSignal({
        request,
        action: ClientSignalAction.SIGNUP,
        wasSuccessful: false,
        clientContext: values.clientContext,
      });
      return error("That username is already taken.", 409);
    }

    const user = await prisma.user.create({
      data: {
        username: values.username,
        hashedPassword: await hashPassword(values.password),
        avatarUrl: randomAvatarId(),
      },
    });

    await createSession(user.id);
    await recordClientSignal({
      request,
      action: ClientSignalAction.SIGNUP,
      wasSuccessful: true,
      userId: user.id,
      clientContext: values.clientContext,
    });

    return ok({ userId: user.id, onboardingComplete: user.onboardingComplete }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to sign up.", 400);
  }
}
