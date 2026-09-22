import { runInboxPreferenceMutation } from "@/lib/api/v1/inbox-preference-route";
import { toggleGroupInboxPin } from "@/lib/api/v1/inbox-preference-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ groupChatId: string }> },
) {
  const { groupChatId } = await params;
  return runInboxPreferenceMutation({
    request,
    field: "groupChatId",
    id: groupChatId,
    logLabel: "POST /api/v1/group-chats/[groupChatId]/inbox-pin",
    execute: (userId) => toggleGroupInboxPin({ userId, groupChatId }),
  });
}
