import { ClientSignalAction } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { recordClientSignal } from "@/lib/abuse/client-signals";
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

    const existing = await prisma.user.findFirst({
      where: {
        OR: [{ username: values.username }, ...(values.email ? [{ email: values.email }] : [])],
      },
    });

    if (existing) {
      await recordClientSignal({
        request,
        action: ClientSignalAction.SIGNUP,
        wasSuccessful: false,
        attemptedEmail: values.email,
        clientContext: values.clientContext,
      });

      if (existing.username === values.username) {
        return error("That username is already taken.", 409);
      }
      return error("That email is already registered.", 409);
    }

    const user = await prisma.user.create({
      data: {
        username: values.username,
        email: values.email ?? null,
        hashedPassword: await hashPassword(values.password),
      },
    });

    await createSession(user.id);
    await recordClientSignal({
      request,
      action: ClientSignalAction.SIGNUP,
      wasSuccessful: true,
      userId: user.id,
      attemptedEmail: values.email,
      clientContext: values.clientContext,
    });

    return ok({ userId: user.id, onboardingComplete: user.onboardingComplete }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to sign up.", 400);
  }
}
