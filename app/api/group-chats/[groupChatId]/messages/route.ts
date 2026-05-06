import { requireGroupChatParticipant } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { notifyNewGroupChatMessage } from "@/lib/push/notify-user";
import { messageSchema } from "@/lib/validators/invitation";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  try {
    const { groupChatId } = await params;
    const { user, groupChat } = await requireGroupChatParticipant(groupChatId);
    const values = await parseJson(request, messageSchema);

    const moderated = await prisma.moderationBlock.findFirst({
      where: { userId: user.id, isActive: true },
      select: { id: true },
    });
    if (moderated) {
      return error("Your account cannot send messages right now.", 403);
    }

    const body = values.body.trim();
    const message = await prisma.groupChatMessage.create({
      data: {
        groupChatId,
        senderId: user.id,
        body,
      },
    });

    await prisma.groupChat.update({
      where: { id: groupChatId },
      data: { updatedAt: message.createdAt },
    });

    void notifyNewGroupChatMessage({
      groupChatId,
      title: groupChat.title,
      senderId: user.id,
      bodyPreview: body,
    }).catch(() => {});

    return ok(message, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to send message.");
  }
}
