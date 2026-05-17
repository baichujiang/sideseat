import { requireUser } from "@/lib/auth/session";
import { ok, error } from "@/lib/http";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const { merged, unreadTotal, plansNeedingYourAction } = await getInboxMergeBundle(user.id);

    const listVersion = merged
      .map((item) => {
        if (item.kind === "direct") {
          return [
            "direct",
            item.connection.id,
            item.connection.messages[0]?.id ?? "none",
            item.unreadCount,
            item.sortAt.toISOString(),
          ].join(":");
        }

        if (item.kind === "course") {
          return [
            "course",
            item.course.id,
            item.last?.id ?? "none",
            item.unreadCount,
            item.sortAt.toISOString(),
          ].join(":");
        }

        return [
          "group",
          item.groupChat.id,
          item.last?.id ?? "none",
          item.unreadCount,
          item.sortAt.toISOString(),
        ].join(":");
      })
      .join("|");
    const version = `${listVersion}|plans:${plansNeedingYourAction}`;

    return ok({
      version,
      unreadTotal,
      plansNeedingYourAction,
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load inbox state.");
  }
}
