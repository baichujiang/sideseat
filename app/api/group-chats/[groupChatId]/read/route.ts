import { requireGroupChatParticipant } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  try {
    const { groupChatId } = await params;
    const { user } = await requireGroupChatParticipant(groupChatId);
    const now = new Date();

    await prisma.groupChatParticipant.update({
      where: {
        groupChatId_userId: {
          groupChatId,
          userId: user.id,
        },
      },
      data: { lastReadAt: now },
    });

    return ok({ readAt: now.toISOString() });
  } catch (cause) {
    console.error(cause);
    return error("Unable to mark group chat as read.");
  }
}
