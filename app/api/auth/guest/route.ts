import { randomBytes } from "crypto";

import { ClientSignalAction, LanguageTag } from "@prisma/client";

import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { recordClientSignal } from "@/lib/abuse/client-signals";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { guestRequestSchema } from "@/lib/validators/auth";

export async function POST(request: Request) {
  try {
    const raw = await request.json().catch(() => ({}));
    const parsed = parseBody(raw, guestRequestSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }
    const { clientContext } = parsed.data;

    const username = `guest_${randomBytes(6).toString("hex")}`;
    const hashedPassword = await hashPassword(randomBytes(32).toString("hex"));

    const user = await prisma.user.create({
      data: {
        username,
        email: null,
        isGuest: true,
        hashedPassword,
        nickname: "Guest",
        school: "TU_BERLIN",
        major: "Exploring",
        semester: 1,
        languages: [LanguageTag.ENGLISH],
        onboardingComplete: true,
      },
    });

    await createSession(user.id);
    await recordClientSignal({
      request,
      action: ClientSignalAction.LOGIN,
      wasSuccessful: true,
      userId: user.id,
      clientContext,
    });

    return ok(
      { userId: user.id, onboardingComplete: true, isGuest: true },
      { status: 201 },
    );
  } catch (cause) {
    console.error(cause);
    return error("Unable to start guest session.", 400);
  }
}
