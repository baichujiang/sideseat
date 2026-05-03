import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { homeProfileQuickPatchSchema } from "@/lib/validators/profile";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const raw = await request.json().catch(() => ({}));
    const parsed = parseBody(raw, homeProfileQuickPatchSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }
    const values = parsed.data;

    const data: { nickname?: string; bio?: string | null } = {};
    if (values.nickname !== undefined) {
      data.nickname = values.nickname.trim();
    }
    if (values.bio !== undefined) {
      data.bio = values.bio.trim() ? values.bio.trim() : null;
    }

    await prisma.user.update({
      where: { id: user.id },
      data,
    });

    return ok({ saved: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update profile.");
  }
}
