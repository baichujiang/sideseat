import { ClientSignalAction } from "@prisma/client";

import { findUserForLogin, identifierLooksLikeEmail } from "@/lib/auth/lookup-user";
import { verifyPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { recordClientSignal } from "@/lib/abuse/client-signals";
import { error, ok, parseBody } from "@/lib/http";
import { loginRequestSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const parsed = parseBody(raw, loginRequestSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }
    const values = parsed.data;

    const user = await findUserForLogin(values.identifier);

    if (!user || !(await verifyPassword(values.password, user.hashedPassword))) {
      await recordClientSignal({
        request,
        action: ClientSignalAction.LOGIN,
        wasSuccessful: false,
        attemptedEmail: identifierLooksLikeEmail(values.identifier)
          ? values.identifier.trim().toLowerCase()
          : undefined,
        clientContext: values.clientContext,
      });

      return error("Invalid username/email or password.", 401);
    }

    await createSession(user.id);
    await recordClientSignal({
      request,
      action: ClientSignalAction.LOGIN,
      wasSuccessful: true,
      userId: user.id,
      attemptedEmail: user.email ?? undefined,
      clientContext: values.clientContext,
    });

    return ok({ userId: user.id, onboardingComplete: user.onboardingComplete });
  } catch (cause) {
    console.error(cause);
    return error("Unable to log in.", 400);
  }
}
