import { randomBytes } from "crypto";

import { LanguageProficiency, LanguageTag } from "@prisma/client";

import { ensureAssistantBotConnection } from "@/lib/auth/assistant-bot";
import { guestNicknameFields } from "@/lib/auth/nickname-fields";
import { hashPassword } from "@/lib/auth/password";
import { createSession } from "@/lib/auth/session";
import { DEFAULT_SCHOOL } from "@/lib/constants/schools";
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

    const username = `guest_${randomBytes(6).toString("hex")}`;
    const hashedPassword = await hashPassword(randomBytes(32).toString("hex"));

    const user = await prisma.user.create({
      data: {
        username,
        email: null,
        isGuest: true,
        hashedPassword,
        ...guestNicknameFields("Guest"),
        school: DEFAULT_SCHOOL,
        major: "Exploring",
        semester: 1,
        userLanguages: {
          create: [{ tag: LanguageTag.ENGLISH, proficiency: LanguageProficiency.FLUENT }],
        },
        onboardingComplete: true,
      },
    });

    const botConnectionId = await ensureAssistantBotConnection(user.id);
    const { accessToken, expiresIn } = await createSession(user.id);

    return ok(
      {
        userId: user.id,
        onboardingComplete: true,
        isGuest: true,
        botConnectionId,
        accessToken,
        expiresIn,
      },
      { status: 201 },
    );
  } catch (cause) {
    console.error(cause);
    return error("Unable to start guest session.", 400);
  }
}
