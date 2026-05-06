import { requireOnboardedUser } from "@/lib/auth/guards";
import { ok, error } from "@/lib/http";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireOnboardedUser();
    const { merged, unreadTotal, plansNeedingYourAction, activePostCount } =
      await getInboxMergeBundle(user.id);

    const version = merged
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

        return [
          "course",
          item.course.id,
          item.last?.id ?? "none",
          item.unreadCount,
          item.sortAt.toISOString(),
        ].join(":");
      })
      .join("|");

    return ok({
      version,
      unreadTotal,
      plansNeedingYourAction,
      activePostCount,
    });
  } catch (cause) {
    console.error(cause);
    return error("Unable to load inbox state.");
  }
}
