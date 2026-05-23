import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseBody } from "@/lib/http";
import { profilePrivacyPatchSchema } from "@/lib/validators/profile";

export async function PATCH(request: Request) {
  try {
    const user = await requireUser();
    const parsed = parseBody(await request.json().catch(() => ({})), profilePrivacyPatchSchema);
    if (!parsed.ok) {
      return error(parsed.error, 422);
    }

    await prisma.user.update({
      where: { id: user.id },
      data: parsed.data,
    });

    return ok({ saved: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update privacy settings.");
  }
}
