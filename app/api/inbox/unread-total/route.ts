import { requireUser } from "@/lib/auth/session";
import { ok, error } from "@/lib/http";
import { getInboxUnreadTotal } from "@/lib/queries/inbox-merge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const unreadTotal = await getInboxUnreadTotal(user.id);
    return ok({ unreadTotal });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load unread count.");
  }
}
