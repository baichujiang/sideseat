import { requireUser } from "@/lib/auth/session";
import { isUsernameAvailable } from "@/lib/auth/username-availability";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { profileUsernameChangeSchema } from "@/lib/validators/profile";

const USERNAME_CHANGE_COOLDOWN_DAYS = 30;
const USERNAME_CHANGE_COOLDOWN_MS = USERNAME_CHANGE_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

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

    if (user.usernameUpdatedAt) {
      const nextAllowedAt = new Date(user.usernameUpdatedAt.getTime() + USERNAME_CHANGE_COOLDOWN_MS);
      if (nextAllowedAt.getTime() > Date.now()) {
        return error(
          `Username can only be changed once every ${USERNAME_CHANGE_COOLDOWN_DAYS} days.`,
          429,
          "USERNAME_CHANGE_COOLDOWN",
        );
      }
    }

    const available = await isUsernameAvailable(username, user.id);
    if (!available) {
      return error("That username is already taken.", 409, "USERNAME_TAKEN");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { username, usernameUpdatedAt: new Date() },
    });

    return ok({ saved: true, username });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update username.", 500, "UNKNOWN");
  }
}
