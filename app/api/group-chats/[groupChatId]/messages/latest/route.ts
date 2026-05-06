import { requireGroupChatParticipant } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  try {
    const { groupChatId } = await params;
    await requireGroupChatParticipant(groupChatId);

    const [latest, messageCount] = await Promise.all([
      prisma.groupChatMessage.findFirst({
        where: { groupChatId },
        orderBy: { createdAt: "desc" },
        select: { id: true, createdAt: true },
      }),
      prisma.groupChatMessage.count({ where: { groupChatId } }),
    ]);

    return ok({
      latestMessageId: latest?.id ?? null,
      latestMessageAt: latest?.createdAt.toISOString() ?? null,
      messageCount,
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load latest message.");
  }
}
