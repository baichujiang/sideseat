import { requireV1User } from "@/lib/api/v1/auth";
import { inboxConversationV1 } from "@/lib/api/v1/inbox-dto";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { prepareInboxListMerged } from "@/lib/inbox/inbox-list-version";
import { getInboxMergeBundle } from "@/lib/queries/inbox-merge";
import { loadActionResponseSummary } from "@/lib/v2/action-coordination/response-service";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;

  try {
    const [{
      merged,
      unreadTotal,
      plansNeedingYourAction,
      planOutcomesNeedingYourResponse,
    }, actionResponseSummary] =
      await Promise.all([
        getInboxMergeBundle(auth.user.id),
        loadActionResponseSummary({ actorId: auth.user.id }),
      ]);
    const conversations = prepareInboxListMerged(merged).map((item) =>
      inboxConversationV1(item, auth.user.id),
    );

    return v1Success(
      {
        conversations,
        unreadTotal,
        plansNeedingYourAction,
        planOutcomesNeedingYourResponse,
        ...(actionResponseSummary ? { actionResponseSummary } : {}),
      },
      { request },
    );
  } catch (cause) {
    console.error("GET /api/v1/inbox", cause);
    return v1Error(request, {
      code: "INTERNAL_ERROR",
      message: "Unable to load the inbox.",
      status: 500,
      retryable: true,
    });
  }
}
