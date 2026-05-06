import { requireConnection } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { ok, error } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  try {
    const { connectionId } = await params;
    const { connection, user } = await requireConnection(connectionId);
    const now = new Date();

    await prisma.connection.update({
      where: { id: connection.id },
      data:
        connection.userAId === user.id
          ? { readByAAt: now }
          : { readByBAt: now },
    });

    return ok({ readAt: now.toISOString() });
  } catch (cause) {
    console.error(cause);
    return error("Unable to mark chat as read.");
  }
}
