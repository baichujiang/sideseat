import { requireUser } from "@/lib/auth/session";
import { ok, error } from "@/lib/http";
import { buildInboxListVersion, prepareInboxListMerged } from "@/lib/inbox/inbox-list-version";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const user = await requireUser();
    const { merged: rawMerged, unreadTotal, plansNeedingYourAction } =
      await getInboxMergeBundle(user.id);
    const merged = prepareInboxListMerged(rawMerged);
    const version = buildInboxListVersion(merged, plansNeedingYourAction);

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
