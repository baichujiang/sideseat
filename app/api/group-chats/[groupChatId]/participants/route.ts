import { requireGroupChatParticipant } from "@/lib/auth/guards";
import { GROUP_CHAT_MAX_MEMBERS } from "@/lib/group-chats/constants";
import { activeContactPeerIdsForViewer } from "@/lib/group-chats/contact-gate";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { groupChatAddMembersSchema } from "@/lib/validators/chat-directory";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  try {
    const { groupChatId } = await params;
    const { user, groupChat } = await requireGroupChatParticipant(groupChatId);
    const values = await parseJson(request, groupChatAddMembersSchema);

    const existingIds = new Set(groupChat.participants.map((p) => p.userId));
    const requested = [...new Set(values.participantIds.filter((id) => id !== user.id))];
    const toAdd = requested.filter((id) => !existingIds.has(id));

    if (toAdd.length === 0) {
      return error("Everyone you selected is already in this group.");
    }

    if (existingIds.size + toAdd.length > GROUP_CHAT_MAX_MEMBERS) {
      return error(`This group can have at most ${GROUP_CHAT_MAX_MEMBERS} members.`);
    }

    const reachable = await activeContactPeerIdsForViewer(user.id, toAdd);
    if (toAdd.some((peerId) => !reachable.has(peerId))) {
      return error("Only existing contacts can be added to a group chat.", 403);
    }

    await prisma.$transaction([
      prisma.groupChatParticipant.createMany({
        data: toAdd.map((peerId) => ({ groupChatId, userId: peerId })),
        skipDuplicates: true,
      }),
      prisma.groupChat.update({
        where: { id: groupChatId },
        data: { updatedAt: new Date() },
      }),
    ]);

    return ok({
      addedUserIds: toAdd,
      memberCount: existingIds.size + toAdd.length,
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to add members.");
  }
}
