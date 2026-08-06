import { runInboxPreferenceMutation } from "@/lib/api/v1/inbox-preference-route";
import { toggleDirectConversationPin } from "@/lib/api/v1/inbox-preference-service";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ connectionId: string }> },
) {
  const { connectionId } = await params;
  return runInboxPreferenceMutation({
    request,
    field: "connectionId",
    id: connectionId,
    logLabel: "POST /api/v1/connections/[connectionId]/pin",
    execute: (userId) =>
      toggleDirectConversationPin({ userId, connectionId }),
  });
}
