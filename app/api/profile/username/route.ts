import { requireUser } from "@/lib/auth/session";
import { isUsernameAvailable } from "@/lib/auth/username-availability";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
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

    const available = await isUsernameAvailable(username, user.id);
    if (!available) {
      return error("That username is already taken.", 409, "USERNAME_TAKEN");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { username },
    });

    return ok({ saved: true, username });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update username.", 500, "UNKNOWN");
  }
}
