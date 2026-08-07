import { Prisma } from "@prisma/client";

import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import {
  nextUsernameChangeWindow,
  USERNAME_CHANGE_LIMIT,
  USERNAME_CHANGE_WINDOW_DAYS,
  usernameChangePolicy,
} from "@/lib/profile/username-change-policy";
import { profileUsernameChangeSchema } from "@/lib/validators/profile";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    if (user.isGuest) {
      return error("Guests cannot change username.", 403);
    }

    const raw = await request.json().catch(() => ({}));
    const parsed = parseBody(raw, profileUsernameChangeSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422, "INVALID_REQUEST");
    }

    const username = parsed.data.username;
    if (username === user.username) {
      return ok({ saved: true, username });
    }

    const now = new Date();
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${user.id} FOR UPDATE`,
      );
      const current = await tx.user.findUnique({ where: { id: user.id } });
      if (!current) return { kind: "not_found" } as const;

      const policy = usernameChangePolicy(current, now);
      if (policy.changesRemaining === 0) {
        return { kind: "cooldown" } as const;
      }

      const taken = await tx.user.findFirst({
        where: { username, NOT: { id: user.id } },
        select: { id: true },
      });
      if (taken) return { kind: "taken" } as const;

      try {
        await tx.user.update({
          where: { id: user.id },
          data: {
            username,
            usernameUpdatedAt: now,
            ...nextUsernameChangeWindow(current, now),
          },
        });
      } catch (cause) {
        if (cause instanceof Prisma.PrismaClientKnownRequestError && cause.code === "P2002") {
          return { kind: "taken" } as const;
        }
        throw cause;
      }

      return { kind: "updated" } as const;
    });

    if (result.kind === "not_found") {
      return error("The current profile was not found.", 404, "NOT_FOUND");
    }
    if (result.kind === "taken") {
      return error("That username is already taken.", 409, "USERNAME_TAKEN");
    }
    if (result.kind === "cooldown") {
      return error(
        `Username can be changed up to ${USERNAME_CHANGE_LIMIT} times every ${USERNAME_CHANGE_WINDOW_DAYS} days.`,
        429,
        "USERNAME_CHANGE_COOLDOWN",
      );
    }

    return ok({ saved: true, username });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update username.", 500, "UNKNOWN");
  }
}
