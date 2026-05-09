import { requireOnboardedUser } from "@/lib/auth/guards";
import { activeContactPeerIdsForViewer } from "@/lib/group-chats/contact-gate";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { groupChatCreateSchema } from "@/lib/validators/chat-directory";

export async function POST(request: Request) {
  try {
    const user = await requireOnboardedUser();
    const values = await parseJson(request, groupChatCreateSchema);

    const participantIds = [...new Set(values.participantIds.filter((id) => id !== user.id))];
    if (participantIds.length < 2) {
      return error("Choose at least two contacts.");
    }

    const reachablePeerIds = await activeContactPeerIdsForViewer(user.id, participantIds);

    if (participantIds.some((peerId) => !reachablePeerIds.has(peerId))) {
      return error("Only existing contacts can be added to a group chat.", 403);
    }

    const title = values.title?.trim() || null;
    const groupChat = await prisma.groupChat.create({
      data: {
        title,
        createdById: user.id,
        participants: {
          create: [
            { userId: user.id, lastReadAt: new Date() },
            ...participantIds.map((participantId) => ({ userId: participantId })),
          ],
        },
      },
      select: { id: true },
    });

    return ok({ groupChatId: groupChat.id }, { status: 201 });
  } catch (cause) {
    console.error(cause);
    return error("Unable to create group chat.");
  }
}
