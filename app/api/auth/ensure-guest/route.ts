import { randomBytes } from "crypto";

import { LanguageProficiency, LanguageTag } from "@prisma/client";

import { ensureAssistantBotConnection } from "@/lib/auth/assistant-bot";
import { guestNicknameFields } from "@/lib/auth/nickname-fields";
import { hashPassword } from "@/lib/auth/password";
import { createSession, getSessionUser } from "@/lib/auth/session";
import { DEFAULT_SCHOOL } from "@/lib/constants/schools";
import { isDatabaseUnreachable, warnDatabaseUnreachableThrottled } from "@/lib/db/prisma-errors";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

/**
 * Starts a lightweight guest session (no signup) so tabs work without login walls.
 * Also ensures the default assistant bot chat exists.
 */
export async function POST() {
  try {
    const existing = await getSessionUser();
    if (existing) {
      const botConnectionId = await ensureAssistantBotConnection(existing.id);
      return ok({
        userId: existing.id,
        isGuest: existing.isGuest,
        onboardingComplete: existing.onboardingComplete,
        created: false,
        botConnectionId,
      });
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
        isGuest: true,
        onboardingComplete: true,
        created: true,
        botConnectionId,
        accessToken,
        expiresIn,
      },
      { status: 201 },
    );
  } catch (cause) {
    if (isDatabaseUnreachable(cause)) {
      warnDatabaseUnreachableThrottled("POST /api/auth/ensure-guest");
      return error(
        "Cannot connect to the database. Check DATABASE_URL and that your database is running.",
        503,
      );
    }
    console.error(cause);
    return error("Unable to start guest session.", 400);
  }
}
