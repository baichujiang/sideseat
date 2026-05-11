import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function POST() {
  try {
    const user = await requireUser();
    if (user.isGuest) {
      return ok({ saved: false, reason: "guest" });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { productTutorialDismissedAt: new Date() },
    });

    return ok({ saved: true });
  } catch (cause) {
    console.error(cause);
    return error("Unable to save preference.");
  }
}
