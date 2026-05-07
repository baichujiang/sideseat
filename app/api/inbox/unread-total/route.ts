import { getSessionUser } from "@/lib/auth/session";
import { ok, error } from "@/lib/http";
import { getInboxUnreadTotal } from "@/lib/queries/inbox-merge";

export const dynamic = "force-dynamic";

/** JSON for client polling — must not `redirect()` (breaks `fetch` + spams dev logs). */
export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return ok({ unreadTotal: 0 });
  }
  try {
    const unreadTotal = await getInboxUnreadTotal(user.id);
    return ok({ unreadTotal });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load unread count.");
  }
}
