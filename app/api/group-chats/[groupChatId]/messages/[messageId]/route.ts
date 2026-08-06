import { requireOnboardedUser } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok } from "@/lib/http";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ groupChatId: string; messageId: string }> },
) {
  try {
    const user = await requireOnboardedUser();
    const { groupChatId, messageId } = await params;

    const membership = await prisma.groupChatParticipant.findUnique({
      where: { groupChatId_userId: { groupChatId, userId: user.id } },
      select: { groupChatId: true },
    });
    if (!membership) {
      return error("Group chat not found.", 404);
    }

    const message = await prisma.groupChatMessage.findFirst({
      where: { id: messageId, groupChatId, senderId: user.id, deletedAt: null },
      select: { id: true },
    });
    if (!message) {
      return error("Message not found or not yours to delete.", 404);
    }

    await prisma.groupChatMessage.update({
      where: { id: message.id },
      data: { deletedAt: new Date(), body: "" },
    });

    return ok({ id: message.id });
  } catch (cause) {
    console.error(cause);
    return error("Unable to delete message.");
  }
}
