import { requireUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function GET() {
  try {
    const user = await requireUser();
    const photos = await prisma.userLifePhoto.findMany({
      where: { userId: user.id },
      orderBy: { sortOrder: "asc" },
      select: { id: true, url: true, sortOrder: true, createdAt: true },
    });
    return ok({ photos });
  } catch (cause) {
    console.error(cause);
    return error("Could not load life photos.");
  }
}
