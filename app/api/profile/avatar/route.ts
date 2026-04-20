import { requireUser } from "@/lib/auth/session";
import { isValidAvatarId } from "@/lib/constants/avatars";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { avatarId } = (await request.json().catch(() => ({}))) as { avatarId?: unknown };

    if (!isValidAvatarId(avatarId)) {
      return error("Pick one of the available avatars.");
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { avatarUrl: avatarId },
    });

    return ok({ avatarId });
  } catch (cause) {
    console.error(cause);
    return error("Could not save avatar.");
  }
}
