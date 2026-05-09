import { requireGroupChatParticipant } from "@/lib/auth/guards";
import { prisma } from "@/lib/db/prisma";
import { error, ok, parseJson } from "@/lib/http";
import { groupChatPatchSchema } from "@/lib/validators/chat-directory";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  try {
    const { groupChatId } = await params;
    await requireGroupChatParticipant(groupChatId);
    const values = await parseJson(request, groupChatPatchSchema);
    const trimmed = values.title.trim();

    const updated = await prisma.groupChat.update({
      where: { id: groupChatId },
      data: { title: trimmed === "" ? null : trimmed },
      select: { title: true },
    });

    return ok({ title: updated.title });
  } catch (cause) {
    console.error(cause);
    return error("Unable to update group chat.");
  }
}
