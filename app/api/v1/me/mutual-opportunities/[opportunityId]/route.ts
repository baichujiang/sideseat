import { requireV1User } from "@/lib/api/v1/auth";
import { requireV1Cuid } from "@/lib/api/v1/ids";
import { v1Error, v1Success } from "@/lib/api/v1/http";
import { getOpportunityConversation, MutualOpportunityError } from "@/lib/v2/mutual-opportunities";

export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: Promise<{ opportunityId: string }> }) {
  const auth = await requireV1User(request);
  if (!auth.ok) return auth.response;
  const { opportunityId } = await params;
  const id = requireV1Cuid(request, opportunityId, "opportunityId");
  if (!id.ok) return id.response;
  try {
    return v1Success(await getOpportunityConversation(auth.user.id, opportunityId), { request });
  } catch (cause) {
    if (cause instanceof MutualOpportunityError) return v1Error(request, {
      code: "NOT_FOUND", message: "Conversation not found.", status: 404,
    });
    console.error("GET opportunity conversation", cause);
    return v1Error(request, { code: "INTERNAL_ERROR", message: "The conversation could not be loaded.", status: 500, retryable: true });
  }
}
